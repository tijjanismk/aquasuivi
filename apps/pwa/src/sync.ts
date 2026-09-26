import { db, ecrireMeta, lireMeta, REFERENTIELS, TABLES, type Ligne, type Segment, type SegmentReferentiel } from './db';
import { appareilId, appelApi, chargerSession, ErreurApi } from './session';

/// Synchronisation (D21) : on pousse d'abord le journal local, puis on tire.
/// Le pull renvoie ainsi la version arbitrée de nos propres lignes.

interface Resultat {
  ressource: Segment;
  id: string;
  statut: 'applique' | 'conflit' | 'rejete';
  gagnant?: 'client' | 'serveur';
  code?: string;
  message?: string;
  version?: string;
}

interface Pull {
  curseur: string;
  saisie: Record<Segment, { modifies: Ligne[]; supprimes: string[] }>;
  referentiels: Record<SegmentReferentiel, Ligne[]>;
  geographie: { regions: Ligne[]; cercles: Ligne[]; communes: Ligne[] };
}

export interface Bilan {
  envoyes: number;
  conflits: number;
  rejets: number;
  recus: number;
}

const PAQUET = 500;

async function pousser(bilan: Bilan) {
  const entrees = (await db.journal.where('etat').equals('attente').toArray()).sort((a, b) => a.seq! - b.seq!);
  if (entrees.length === 0) return;
  const appareil = await appareilId();

  for (let i = 0; i < entrees.length; i += PAQUET) {
    const paquet = entrees.slice(i, i + PAQUET);
    await db.journal.bulkUpdate(paquet.map((e) => ({ key: e.seq!, changes: { etat: 'envoi' as const } })));
    let resultats: Resultat[];
    try {
      ({ resultats } = await appelApi<{ resultats: Resultat[] }>('/sync/push', {
        method: 'POST',
        body: JSON.stringify({
          appareilId: appareil,
          changements: paquet.map((e) => ({
            ressource: e.ressource,
            id: e.id,
            operation: e.operation,
            donnees: e.donnees,
            versionBase: e.versionBase,
            modifieLe: e.modifieLe,
          })),
        }),
      }));
    } catch (erreur) {
      // Réseau coupé en plein envoi : tout repart au prochain essai. Le serveur
      // reconnaît un push rejoué, il n'y aura pas de conflit fantôme.
      await db.journal.bulkUpdate(paquet.map((e) => ({ key: e.seq!, changes: { etat: 'attente' as const } })));
      throw erreur;
    }

    await db.transaction('rw', [...Object.values(TABLES), db.journal], async () => {
      for (const [n, r] of resultats.entries()) {
        const e = paquet[n]!;
        if (r.statut === 'rejete') {
          bilan.rejets++;
          await db.journal.update(e.seq!, { etat: 'rejete', code: r.code, message: r.message });
          continue;
        }
        bilan.envoyes++;
        if (r.statut === 'conflit') bilan.conflits++;
        await db.journal.delete(e.seq!);
        if (r.statut === 'applique' && r.version && e.operation === 'ecrire') {
          // Nouvelle version de référence, pour la ligne et pour une saisie
          // faite pendant l'envoi : sans quoi elle partirait en conflit avec
          // notre propre écriture.
          await TABLES[e.ressource].update(e.id, { _version: r.version });
          await db.journal.where('id').equals(e.id).modify({ versionBase: r.version });
        }
      }
    });
  }
}

async function tirer(bilan: Bilan) {
  const curseur = await lireMeta<string>('curseur');
  const parametres = new URLSearchParams({ appareilId: await appareilId() });
  if (curseur) parametres.set('depuis', curseur);
  const r = await appelApi<Pull>(`/sync/pull?${parametres}`);

  // Une ligne encore dans le journal a une modification locale non acceptée :
  // le pull ne l'écrase pas, l'utilisateur la corrige ou l'abandonne.
  const enCours = new Set((await db.journal.toArray()).map((e) => e.id));
  const tables = [
    ...Object.values(TABLES), ...Object.values(REFERENTIELS),
    db.regions, db.cercles, db.communes, db.meta,
  ];
  await db.transaction('rw', tables, async () => {
    for (const [segment, { modifies, supprimes }] of Object.entries(r.saisie) as [Segment, Pull['saisie'][Segment]][]) {
      const lignes = modifies.filter((l) => !enCours.has(l.id)).map((l) => ({ ...l, _version: l['updatedAt'] }));
      bilan.recus += lignes.length + supprimes.length;
      await TABLES[segment].bulkPut(lignes);
      await TABLES[segment].bulkDelete(supprimes.filter((id) => !enCours.has(id)));
    }
    for (const [segment, lignes] of Object.entries(r.referentiels) as [SegmentReferentiel, Ligne[]][]) {
      await REFERENTIELS[segment].bulkPut(lignes);
    }
    await db.regions.bulkPut(r.geographie.regions);
    await db.cercles.bulkPut(r.geographie.cercles);
    await db.communes.bulkPut(r.geographie.communes);
    await ecrireMeta('curseur', r.curseur);
  });
}

// -----------------------------------------------------------------------------
//  Déclenchement
// -----------------------------------------------------------------------------

let enCours: Promise<Bilan | null> | null = null;

/// Relance après un échec réseau. `navigator.onLine` ne suffit pas : il dit
/// vrai sur un Wi-Fi sans internet ou sur une 2G qui ne passe pas, et
/// l'évènement `online` ne revient alors jamais.
const RELANCES_MS = [5_000, 15_000, 30_000, 60_000, 120_000, 300_000];
let essaisRates = 0;
let relance: ReturnType<typeof setTimeout> | undefined;

function relancer() {
  clearTimeout(relance);
  const delai = RELANCES_MS[Math.min(essaisRates, RELANCES_MS.length - 1)]!;
  essaisRates++;
  relance = setTimeout(() => void synchroniser(), delai);
}

/// Une synchronisation à la fois. `null` : hors ligne ou non connecté.
export function synchroniser(): Promise<Bilan | null> {
  enCours ??= (async () => {
    if (!navigator.onLine || !(await chargerSession())) return null;
    await ecrireMeta('syncEnCours', true);
    const bilan: Bilan = { envoyes: 0, conflits: 0, rejets: 0, recus: 0 };
    try {
      await pousser(bilan);
      await tirer(bilan);
      await ecrireMeta('derniereSync', new Date().toISOString());
      await ecrireMeta('derniereErreur', null);
      await ecrireMeta('reseauIndisponible', false);
      await ecrireMeta('dernierBilan', bilan);
      essaisRates = 0;
      clearTimeout(relance);
      return bilan;
    } catch (e) {
      const reseau = !(e instanceof ErreurApi) || e.code === 'HORS_LIGNE';
      await ecrireMeta('reseauIndisponible', reseau);
      await ecrireMeta(
        'derniereErreur',
        reseau ? 'Réseau indisponible — nouvel essai automatique' : (e as Error).message,
      );
      if (reseau) relancer();
      return null;
    } finally {
      await ecrireMeta('syncEnCours', false);
    }
  })().finally(() => {
    enCours = null;
  });
  return enCours;
}

let minuterie: ReturnType<typeof setTimeout> | undefined;

/// Après une saisie : on attend un peu, pour grouper une pesée et ses
/// échantillons dans le même envoi.
export function demanderSync(delaiMs = 2000) {
  clearTimeout(minuterie);
  minuterie = setTimeout(() => void synchroniser(), delaiMs);
}

/// Au démarrage, au retour du réseau, au retour sur l'application, et toutes
/// les cinq minutes : sur iOS, une PWA peut perdre son stockage après des
/// semaines d'inactivité (D19) — mieux vaut ne rien garder longtemps en attente.
export function demarrerSynchronisation() {
  window.addEventListener('online', () => demanderSync(500));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') demanderSync(500);
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void synchroniser();
  }, 5 * 60 * 1000);
  demanderSync(0);
}
