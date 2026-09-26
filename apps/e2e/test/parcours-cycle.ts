/// Rejoue le cycle de référence B4 (bassin de Kotouba, 2021-2022) **à travers
/// l'API**, puis compare les indicateurs aux valeurs verrouillées par
/// `packages/shared/test/b4.ts`.
///
/// C'est le critère d'acceptation de l'étape 4 : si l'adaptation
/// `Decimal → number` ou la conversion des dates de terrain était fausse, les
/// chiffres divergeraient ici alors que `test:shared` resterait vert.
///
/// Prérequis : `pnpm dev:api`. Le test crée une ferme complète puis la
/// supprime — y compris ses cycles, par cascade.

import { Pool } from 'pg';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { authentifierEnAdmin } from './session.js';

process.loadEnvFile(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env'),
);

const API = process.env['E2E_API_URL'] ?? 'http://localhost:3000/api';
const FERME_TEST = 'Ferme parcours cycle B4';

const resultats: { libelle: string; ok: boolean; detail: string }[] = [];
function verifier(libelle: string, obtenu: unknown, attendu: unknown) {
  resultats.push({
    libelle,
    ok: obtenu === attendu,
    detail: `obtenu=${String(obtenu)}  attendu=${String(attendu)}`,
  });
}

async function appel<T>(methode: string, chemin: string, corps?: unknown): Promise<T> {
  const reponse = await fetch(`${API}${chemin}`, {
    method: methode,
    ...(corps === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }),
  });
  const texte = await reponse.text();
  if (!reponse.ok) throw new Error(`${methode} ${chemin} → ${reponse.status} ${texte}`);
  return texte ? (JSON.parse(texte) as T) : (undefined as T);
}

const creer = <T>(ressource: string, donnees: unknown) =>
  appel<T>('POST', `/saisie/${ressource}`, donnees);

interface AvecId {
  id: string;
}

/// Mêmes échantillons que `test/b4.ts` : [date, numéro de pesée, [nombre, poids total]]
const PESEES: [string, number, [number, number][]][] = [
  ['2021-07-30', 1, [[12, 455], [10, 392], [11, 418]]],
  ['2021-08-30', 2, [[10, 905], [12, 1108], [9, 820]]],
  ['2021-09-29', 3, [[10, 1560], [11, 1735], [10, 1585]]],
  ['2021-10-29', 4, [[8, 1815], [10, 2290], [9, 2050]]],
  ['2021-11-28', 5, [[8, 2350], [9, 2680], [8, 2375]]],
  ['2021-12-28', 6, [[7, 2455], [8, 2820], [7, 2450]]],
];

async function reference(chemin: string, critere: (l: Record<string, unknown>) => boolean) {
  const lignes = await appel<Record<string, unknown>[]>('GET', `${chemin}?_end=200`);
  const trouve = lignes.find(critere);
  if (!trouve) throw new Error(`Référentiel introuvable dans ${chemin}`);
  return trouve['id'] as string;
}

async function construireCycle() {
  const tilapiaId = await reference('/referentiels/especes', (e) => e['codeFao'] === 'TLN');
  const typeId = await reference(
    '/referentiels/types-infrastructure',
    (t) => t['code'] === 'RIZIPISCICULTURE',
  );
  const oxyfuranId = await reference(
    '/referentiels/produits-sanitaires',
    (p) => p['nom'] === 'Oxyfuran',
  );
  const aliments = await appel<Record<string, unknown>[]>(
    'GET',
    '/referentiels/aliments?_end=200',
  );
  const alimentId = aliments[0]!['id'] as string;

  const ferme = await creer<AvecId>('fermes', { nom: FERME_TEST, pays: 'Mali' });

  // 10 × 10 m sans profondeur : la superficie doit être calculée à 100 m² par
  // le paquet partagé, et le volume rester nul — comme dans le cas B4.
  const infra = await creer<AvecId & { superficie: number; volume: number | null }>(
    'infrastructures',
    {
      nom: 'B4',
      fermeId: ferme.id,
      typeInfrastructureId: typeId,
      longueur: 10,
      largeur: 10,
    },
  );
  verifier('superficie calculée à l’écriture', infra.superficie, 100);
  verifier('volume laissé nul sans profondeur', infra.volume, null);

  const cycle = await creer<AvecId>('cycles', {
    infrastructureId: infra.id,
    numero: 1,
    dateMiseEnCharge: '2021-06-30',
    dateCloture: '2022-01-28',
    statut: 'BOUCLE',
    especeId: tilapiaId,
  });

  const lot = await creer<AvecId>('lots', {
    cycleId: cycle.id,
    especeId: tilapiaId,
    nombre: 1000,
    poidsMoyenG: 5,
    coutUnitaire: 110,
    dateMiseEnCharge: '2021-06-30',
  });

  for (const [dateConstat, nombre] of [
    ['2021-07-14', 38],
    ['2021-09-02', 22],
  ] as [string, number][]) {
    await creer('mortalites', { lotId: lot.id, dateConstat, nombre, remplacement: 0 });
  }

  for (const [dateOperation, numero, echantillons] of PESEES) {
    const pesee = await creer<AvecId>('pesees', {
      cycleId: cycle.id,
      numero,
      dateOperation,
      tauxRationPct: 2.5,
    });
    let i = 1;
    for (const [nombre, poidsTotalG] of echantillons) {
      await creer('echantillons', {
        peseeId: pesee.id,
        lotId: lot.id,
        numero: i++,
        nombre,
        poidsTotalG,
      });
    }
  }

  for (const [dateDebut, quantiteTotaleKg, prixKgApplique] of [
    ['2021-06-30', 22, 1150],
    ['2021-08-01', 64, 1150],
    ['2021-09-15', 118, 800],
    ['2021-10-15', 390, 250],
  ] as [string, number, number][]) {
    await creer('distributions', {
      cycleId: cycle.id,
      alimentId,
      dateDebut,
      quantiteTotaleKg,
      prixKgApplique,
    });
  }

  // `finDelaiAttente` n'est pas fourni : l'API doit le déduire du produit.
  // Oxyfuran = 30 jours, ce qui redonne les dates du cas de référence.
  const traitements: { finDelaiAttente: string }[] = [];
  for (const dateOperation of ['2021-08-12', '2021-11-05']) {
    traitements.push(
      await creer<{ finDelaiAttente: string }>('traitements', {
        cycleId: cycle.id,
        produitSanitaireId: oxyfuranId,
        dateOperation,
        quantite: 1,
        prixUnitaire: 3500,
      }),
    );
  }
  verifier('délai d’attente déduit du produit', traitements[0]?.finDelaiAttente, '2021-09-11');
  verifier('date de terrain sans dérive de fuseau', traitements[1]?.finDelaiAttente, '2021-12-05');

  for (const [dateOperation, type, poidsKg] of [
    ['2022-01-12', 'VENTE', 120],
    ['2022-01-19', 'VENTE', 95],
    ['2022-01-26', 'VENTE', 65],
    ['2022-01-26', 'DON', 25],
    ['2022-01-28', 'AUTOCONSOMMATION', 25],
  ] as [string, string, number][]) {
    await creer('recoltes', {
      cycleId: cycle.id,
      lotId: lot.id,
      especeId: tilapiaId,
      dateOperation,
      type,
      poidsKg,
      prixKg: 1750,
    });
  }

  for (const [categorie, montant] of [
    ['EAU', 25000],
    ['MAIN_OEUVRE', 90000],
  ] as [string, number][]) {
    await creer('depenses', {
      cycleId: cycle.id,
      categorie,
      montant,
      dateOperation: '2022-01-28',
    });
  }

  return cycle.id;
}

interface Indicateurs {
  cycle: { dureeJours: number };
  zootechnie: {
    effectifFinal: number;
    tauxSurviePct: number;
    poidsMoyenFinalG: number;
    coefficientVariationPct: number;
  };
  alimentation: { alimentDistribueKg: number; indiceConsommation: number };
  production: { productionRecolteeKg: number };
  economie: {
    charges: {
      alevins: number;
      aliments: number;
      traitements: number;
      autres: number;
      total: number;
    };
    produits: { total: number };
    prixRevientKg: number;
    prixVenteMoyenKg: number;
    margeKg: number;
    resultat: number;
    rentabilitePct: number;
  };
  conformite: { recoltesNonConformes: number };
}

async function nettoyer() {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  try {
    // Cascade : Ferme → Infrastructure → Cycle → lots, pesées, récoltes…
    await pool.query('DELETE FROM "Ferme" WHERE nom LIKE $1', [`${FERME_TEST}%`]);
  } finally {
    await pool.end();
  }
}

/// D12 : une suppression hors ligne doit se propager sans faire disparaître
/// une ligne qu'un autre appareil vient de modifier. La ligne sort donc des
/// lectures mais reste en base.
async function verifierSuppressionDouce() {
  const ferme = await creer<AvecId>('fermes', { nom: `${FERME_TEST} (suppression)` });
  await appel('DELETE', `/saisie/fermes/${ferme.id}`);

  const liste = await appel<AvecId[]>('GET', '/saisie/fermes?_end=200');
  verifier('ligne supprimée absente de la liste', liste.some((f) => f.id === ferme.id), false);

  const direct = await fetch(`${API}/saisie/fermes/${ferme.id}`);
  verifier('lecture directe d’une ligne supprimée', direct.status, 404);

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  try {
    const { rows } = await pool.query('SELECT "deletedAt" FROM "Ferme" WHERE id = $1', [ferme.id]);
    verifier('ligne conservée en base', rows.length, 1);
    verifier('deletedAt renseigné', rows[0]?.deletedAt !== null, true);
  } finally {
    await pool.end();
  }
}

if (!(await fetch(`${API}/sante`).then((r) => r.ok).catch(() => false))) {
  console.error(`API injoignable sur ${API}. Lancez-la avec « pnpm dev:api ».`);
  process.exit(1);
}
await authentifierEnAdmin(API);

await nettoyer();
try {
  const cycleId = await construireCycle();
  const i = await appel<Indicateurs>('GET', `/cycles/${cycleId}/indicateurs`);

  // Les 16 valeurs verrouillées par packages/shared/test/b4.ts.
  verifier('effectif final', i.zootechnie.effectifFinal, 940);
  verifier('taux de survie %', i.zootechnie.tauxSurviePct, 94);
  verifier('poids moyen final g', Math.round(i.zootechnie.poidsMoyenFinalG), 351);
  verifier('production kg', i.production.productionRecolteeKg, 330);
  verifier('charges alevins', i.economie.charges.alevins, 110000);
  verifier('charges aliments', i.economie.charges.aliments, 290800);
  verifier('charges traitements', i.economie.charges.traitements, 7000);
  verifier('charges autres', i.economie.charges.autres, 115000);
  verifier('total charges', i.economie.charges.total, 522800);
  verifier('total produits', i.economie.produits.total, 577500);
  verifier('prix de revient F/kg', i.economie.prixRevientKg, 1584);
  verifier('prix de vente F/kg', i.economie.prixVenteMoyenKg, 1750);
  verifier('marge F/kg', i.economie.margeKg, 166);
  verifier('résultat F', i.economie.resultat, 54700);
  verifier('rentabilité %', i.economie.rentabilitePct, 10.46);
  verifier('récoltes non conformes', i.conformite.recoltesNonConformes, 0);

  // La fiche de cycle lit ces champs par leur nom : les renommer côté socle
  // ferait afficher un tiret sans rien casser ailleurs.
  verifier('aliment distribué (champ lu par l’admin)', i.alimentation.alimentDistribueKg, 594);
  verifier('indice de consommation', i.alimentation.indiceConsommation, 1.828);
  verifier('coefficient de variation', i.zootechnie.coefficientVariationPct, 0.37);
  verifier('durée du cycle', i.cycle.dureeJours, 212);

  await verifierSuppressionDouce();
} catch (e) {
  resultats.push({ libelle: 'parcours interrompu', ok: false, detail: (e as Error).message });
} finally {
  await nettoyer();
}

for (const { libelle, ok, detail } of resultats) {
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${libelle.padEnd(34)} ${detail}`);
}
const echecs = resultats.filter((r) => !r.ok).length;
console.log(echecs === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${echecs} CONTROLE(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
