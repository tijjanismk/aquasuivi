import { ulid } from 'ulid';
import {
  ajouterJours,
  aujourdhui,
  controlerCoordonnees,
  controlerCycle,
  controlerDepense,
  controlerDistribution,
  controlerEchantillon,
  controlerInfrastructure,
  controlerLot,
  controlerMesureEau,
  controlerMortalite,
  controlerPesee,
  controlerRecolte,
  controlerTraitement,
  dimensionsCalculees,
  type BornesCycle,
  type Violation,
} from '@aqua/shared';
import { db, PARENT, TABLES, type EntreeJournal, type Ligne, type Segment } from './db';
import { demanderSync } from './sync';

const nombreOuNul = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

/// Saisie refusée sur le téléphone, avant tout envoi : mêmes règles que
/// l'API (D20), contexte lu dans IndexedDB au lieu de PostgreSQL.
export class ErreurSaisie extends Error {
  constructor(readonly violations: Violation[]) {
    super(violations.map((v) => v.message).join(' '));
  }
}

const bornes = (c: Ligne): BornesCycle => ({
  dateMiseEnCharge: c['dateMiseEnCharge'],
  dateCloture: c['dateCloture'] ?? null,
});

const somme = (lignes: Ligne[], champ: string) =>
  lignes.reduce((s, l) => s + (Number(l[champ]) || 0), 0);

function incoherent(champ: string, message: string): Violation {
  return { code: 'RATTACHEMENT_INCOHERENT', champ, message };
}

// -----------------------------------------------------------------------------
//  Contrôles, avec le contexte local
// -----------------------------------------------------------------------------

async function controler(ressource: Segment, ligne: Ligne, existe: boolean): Promise<Violation[]> {
  // Vue sans `id` ni `_version` : les contrôles partagés attendent des
  // colonnes, et TypeScript refuse une ligne qui n'en déclare aucune.
  const l: Record<string, any> = ligne;
  const auj = aujourdhui();
  const cycleDe = async (id: unknown) => (id ? await db.cycles.get(String(id)) : undefined);

  switch (ressource) {
    case 'fermes':
      return [
        ...(l['nom'] ? [] : [{ code: 'CHAMP_REQUIS', champ: 'nom', message: 'Le nom est obligatoire.' }]),
        ...controlerCoordonnees({ latitude: nombreOuNul(l['latitude']), longitude: nombreOuNul(l['longitude']) }),
      ];
    case 'infrastructures':
      return controlerInfrastructure(l);
    case 'cycles': {
      const infra = await db.infrastructures.get(String(l['infrastructureId']));
      const autres = (await db.cycles.where('infrastructureId').equals(String(l['infrastructureId'])).toArray())
        .filter((c) => c.id !== ligne.id);
      const debut: string | undefined = l['dateMiseEnCharge'];
      const precedent = debut
        ? autres.filter((c) => c['dateMiseEnCharge'] <= debut).sort((a, b) => (a['dateMiseEnCharge'] < b['dateMiseEnCharge'] ? 1 : -1))[0]
        : undefined;
      const suivant = debut
        ? autres.filter((c) => c['dateMiseEnCharge'] > debut).sort((a, b) => (a['dateMiseEnCharge'] > b['dateMiseEnCharge'] ? 1 : -1))[0]
        : undefined;
      const { premiere, derniere } = existe ? await operations(ligne.id) : { premiere: null, derniere: null };
      return controlerCycle(l, {
        aujourdhui: auj,
        infrastructureActive: infra?.['actif'] ?? true,
        cloturePrecedente: precedent?.['dateCloture'] ?? null,
        miseEnChargeSuivante: suivant?.['dateMiseEnCharge'] ?? null,
        premiereOperation: premiere,
        derniereOperation: derniere,
        creation: !existe,
        autreCycleOuvert: autres.some((c) => !c['dateCloture']),
      });
    }
    case 'lots': {
      const c = await cycleDe(l['cycleId']);
      return c ? controlerLot(l, bornes(c), auj) : [];
    }
    case 'mortalites': {
      const lot = await db.lots.get(String(l['lotId']));
      const c = lot && (await cycleDe(lot['cycleId']));
      if (!lot || !c) return [];
      const autres = (await db.mortalites.where('lotId').equals(lot.id).toArray()).filter((m) => m.id !== ligne.id);
      const recoltes = await db.recoltes.where('lotId').equals(lot.id).toArray();
      return controlerMortalite(
        l,
        {
          lot: { nombre: lot['nombre'], dateMiseEnCharge: lot['dateMiseEnCharge'] },
          autres: { nombre: somme(autres, 'nombre'), remplacement: somme(autres, 'remplacement') },
          recoltes: somme(recoltes, 'nombre'),
        },
        bornes(c),
        auj,
      );
    }
    case 'pesees': {
      const c = await cycleDe(l['cycleId']);
      return c ? controlerPesee(l, bornes(c), auj) : [];
    }
    case 'echantillons': {
      const v = controlerEchantillon(l);
      const pesee = await db.pesees.get(String(l['peseeId']));
      const lot = l['lotId'] ? await db.lots.get(String(l['lotId'])) : undefined;
      if (pesee && lot && lot['cycleId'] !== pesee['cycleId']) {
        v.push(incoherent('lotId', 'Ce lot appartient à un autre cycle.'));
      }
      return v;
    }
    case 'distributions': {
      const c = await cycleDe(l['cycleId']);
      return c ? controlerDistribution(l, bornes(c), auj) : [];
    }
    case 'traitements': {
      const c = await cycleDe(l['cycleId']);
      return c ? controlerTraitement(l, bornes(c), auj) : [];
    }
    case 'recoltes': {
      const c = await cycleDe(l['cycleId']);
      if (!c) return [];
      const v: Violation[] = [];
      const lot = l['lotId'] ? await db.lots.get(String(l['lotId'])) : undefined;
      if (lot && lot['cycleId'] !== c.id) v.push(incoherent('lotId', 'Ce lot appartient à un autre cycle.'));
      const lots = lot ? [lot] : await db.lots.where('cycleId').equals(c.id).toArray();
      const morts = (await Promise.all(lots.map((x) => db.mortalites.where('lotId').equals(x.id).toArray()))).flat();
      const sorties = (await db.recoltes.where('cycleId').equals(c.id).toArray()).filter(
        (r) => r.id !== ligne.id && (!lot || r['lotId'] === lot.id),
      );
      const effectifRestant =
        somme(lots, 'nombre') + somme(morts, 'remplacement') - somme(morts, 'nombre') - somme(sorties, 'nombre');
      v.push(...controlerRecolte(l, { especeLot: lot?.['especeId'] ?? null, effectifRestant }, bornes(c), auj));
      return v;
    }
    case 'depenses': {
      const c = await cycleDe(l['cycleId']);
      return c ? controlerDepense(l, bornes(c), auj) : [];
    }
    case 'mesures-eau': {
      const c = await cycleDe(l['cycleId']);
      const v = controlerMesureEau(l, c ? bornes(c) : null, auj);
      if (c && c['infrastructureId'] !== l['infrastructureId']) {
        v.push(incoherent('cycleId', 'Ce cycle se déroule dans une autre infrastructure.'));
      }
      return v;
    }
  }
}

/// Première et dernière opération d'un cycle ; les dépenses ne comptent que
/// pour la dernière (préparation du bassin avant la mise en charge).
async function operations(cycleId: string) {
  const parCycle = (t: Segment) => TABLES[t].where('cycleId').equals(cycleId).toArray();
  const [lots, pesees, distributions, traitements, recoltes, mesures, depenses] = await Promise.all([
    parCycle('lots'), parCycle('pesees'), parCycle('distributions'), parCycle('traitements'),
    parCycle('recoltes'), parCycle('mesures-eau'), parCycle('depenses'),
  ]);
  const morts = (await Promise.all(lots.map((l) => db.mortalites.where('lotId').equals(l.id).toArray()))).flat();
  const debuts = [
    ...lots.map((x) => x['dateMiseEnCharge']), ...morts.map((x) => x['dateConstat']),
    ...pesees.map((x) => x['dateOperation']), ...distributions.map((x) => x['dateDebut']),
    ...traitements.map((x) => x['dateOperation']), ...recoltes.map((x) => x['dateOperation']),
    ...mesures.map((x) => x['dateMesure']),
  ].filter(Boolean).sort();
  const fins = [...debuts, ...distributions.map((x) => x['dateFin']), ...depenses.map((x) => x['dateOperation'])]
    .filter(Boolean)
    .sort();
  return { premiere: debuts[0] ?? null, derniere: fins.at(-1) ?? null };
}

// -----------------------------------------------------------------------------
//  Champs dérivés, pour l'affichage local — l'API les recalcule elle-même
// -----------------------------------------------------------------------------

async function prochainNumero(table: Segment, champ: string, valeur: unknown) {
  const lignes = await TABLES[table].where(champ).equals(String(valeur)).toArray();
  return Math.max(0, ...lignes.map((x) => Number(x['numero']) || 0)) + 1;
}

async function deriver(ressource: Segment, l: Ligne, creation: boolean): Promise<Ligne> {
  switch (ressource) {
    case 'infrastructures': {
      const type = await db.typesInfrastructure.get(String(l['typeInfrastructureId']));
      if (!type) return l;
      const nb = (c: string) => (l[c] == null || l[c] === '' ? null : Number(l[c]));
      return {
        ...l,
        ...dimensionsCalculees({
          forme: type['forme'],
          longueur: nb('longueur'),
          largeur: nb('largeur'),
          diametre: nb('diametre'),
          profondeur: nb('profondeur'),
          niveauRemplissage: nb('niveauRemplissage'),
        }),
      };
    }
    case 'cycles':
      return {
        ...l,
        statut: l['dateCloture'] ? 'BOUCLE' : l['statut'] === 'BOUCLE' ? 'EN_COURS' : (l['statut'] ?? 'EN_COURS'),
        ...(creation ? { numero: await prochainNumero('cycles', 'infrastructureId', l['infrastructureId']) } : {}),
      };
    case 'pesees':
      return creation ? { ...l, numero: await prochainNumero('pesees', 'cycleId', l['cycleId']) } : l;
    case 'echantillons':
      return creation ? { ...l, numero: await prochainNumero('echantillons', 'peseeId', l['peseeId']) } : l;
    case 'traitements': {
      const produit = l['produitSanitaireId'] ? await db.produitsSanitaires.get(String(l['produitSanitaireId'])) : undefined;
      return produit && l['dateOperation']
        ? { ...l, finDelaiAttente: ajouterJours(l['dateOperation'], Number(produit['delaiAttenteJours']) || 0) }
        : l;
    }
    case 'distributions': {
      // Prix vide : celui du référentiel, figé sur la ligne — même règle que l'API.
      if (l['prixKgApplique'] != null && l['prixKgApplique'] !== '') return l;
      const aliment = l['alimentId'] ? await db.aliments.get(String(l['alimentId'])) : undefined;
      return aliment?.['prixKg'] != null ? { ...l, prixKgApplique: Number(aliment['prixKg']) } : l;
    }
    default:
      return l;
  }
}

// -----------------------------------------------------------------------------
//  Journal des changements à envoyer (D21)
// -----------------------------------------------------------------------------

/// Une ligne n'a qu'une entrée en attente : deux saisies successives de la
/// même pesée partiraient sinon avec la même `versionBase`, et la seconde
/// entrerait en conflit avec la première.
async function journaliser(e: Omit<EntreeJournal, 'etat' | 'modifieLe'>) {
  const modifieLe = new Date().toISOString();
  const ouverte = (await db.journal.where('id').equals(e.id).toArray()).find((x) => x.etat !== 'envoi');

  if (e.operation === 'supprimer') {
    if (ouverte?.operation === 'ecrire' && ouverte.versionBase === null && !(await dejaEnvoyee(e.id))) {
      // Jamais parvenue au serveur : il n'y a rien à supprimer là-bas.
      await db.journal.delete(ouverte.seq!);
      return;
    }
    if (ouverte) await db.journal.delete(ouverte.seq!);
    await db.journal.add({ ...e, versionBase: ouverte?.versionBase ?? e.versionBase, modifieLe, etat: 'attente' });
    return;
  }
  if (ouverte && ouverte.operation === 'ecrire') {
    await db.journal.update(ouverte.seq!, {
      donnees: { ...ouverte.donnees, ...e.donnees },
      modifieLe,
      etat: 'attente',
      code: undefined,
      message: undefined,
    });
    return;
  }
  await db.journal.add({ ...e, modifieLe, etat: 'attente' });
}

/// Une écriture déjà partie (en vol ou appliquée) : la ligne existe au serveur.
async function dejaEnvoyee(id: string) {
  const envoi = await db.journal.where('id').equals(id).filter((x) => x.etat === 'envoi').count();
  return envoi > 0;
}

function champsModifies(avant: Ligne, saisie: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(saisie).filter(([k, v]) => avant[k] !== v));
}

/// Nettoyage d'un formulaire : texte vide → absent, nombres en nombres.
function nettoyer(saisie: Record<string, unknown>) {
  const sortie: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(saisie)) {
    if (v === '' || v === undefined) continue;
    sortie[k] = v;
  }
  return sortie;
}

// -----------------------------------------------------------------------------
//  API du module
// -----------------------------------------------------------------------------

/// Crée ou modifie une ligne **sur le téléphone**, puis la met en file pour
/// la synchronisation. Refuse avec `ErreurSaisie` ce que l'API refuserait.
export async function enregistrer(ressource: Segment, saisie: Record<string, unknown>, id?: string) {
  const table = TABLES[ressource];
  const existante = id ? await table.get(id) : undefined;
  const donnees = existante ? saisie : nettoyer(saisie);
  const ligne = await deriver(ressource, { ...existante, ...donnees, id: id ?? ulid() }, !existante);

  const violations = await controler(ressource, ligne, !!existante);
  if (violations.length > 0) throw new ErreurSaisie(violations);

  await db.transaction('rw', [table, db.journal], async () => {
    await table.put({ ...ligne, _version: existante?._version ?? null });
    const envoyer = existante ? champsModifies(existante, donnees) : donnees;
    if (Object.keys(envoyer).length > 0) {
      await journaliser({
        ressource,
        id: ligne.id,
        operation: 'ecrire',
        donnees: envoyer,
        versionBase: existante?._version ?? null,
      });
    }
  });
  demanderSync();
  return ligne;
}

/// Suppression locale, en cascade comme côté serveur. Seul le parent part au
/// serveur : il supprime lui-même les enfants (D12).
export async function supprimer(ressource: Segment, id: string) {
  const tables = [...Object.values(TABLES), db.journal];
  await db.transaction('rw', tables, async () => {
    await retirerEnfants(ressource, id);
    const ligne = await TABLES[ressource].get(id);
    await TABLES[ressource].delete(id);
    await journaliser({ ressource, id, operation: 'supprimer', versionBase: ligne?._version ?? null });
  });
  demanderSync();
}

async function retirerEnfants(ressource: Segment, id: string) {
  for (const [enfant, parent] of Object.entries(PARENT) as [Segment, { segment: Segment; champ: string }][]) {
    if (parent.segment !== ressource) continue;
    const lignes = await TABLES[enfant].where(parent.champ).equals(id).toArray();
    for (const l of lignes) {
      await retirerEnfants(enfant, l.id);
      await TABLES[enfant].delete(l.id);
      // Écritures en attente sur un enfant : sans objet, le parent disparaît.
      await db.journal.where('id').equals(l.id).filter((e) => e.etat !== 'envoi').delete();
    }
  }
}

/// Abandonne une saisie refusée par le serveur : la ligne locale revient à la
/// version serveur au prochain pull, ou disparaît si elle n'y a jamais existé.
export async function abandonner(entree: EntreeJournal) {
  await db.transaction('rw', [...Object.values(TABLES), db.journal], async () => {
    await db.journal.delete(entree.seq!);
    const ligne = await TABLES[entree.ressource].get(entree.id);
    if (ligne && !ligne._version) {
      await retirerEnfants(entree.ressource, entree.id);
      await TABLES[entree.ressource].delete(entree.id);
    }
  });
  // Une version serveur existe : on la redemande entière au prochain pull.
  if (entree.versionBase) await db.meta.delete('curseur');
  demanderSync();
}

export async function reessayer() {
  await db.journal.where('etat').equals('rejete').modify({ etat: 'attente' });
  demanderSync();
}
