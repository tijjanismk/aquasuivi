/// Contrôles de cohérence d'un cycle, vus depuis l'API.
///
/// Les règles elles-mêmes sont testées dans `packages/shared/test/controles.ts`.
/// Ici, on vérifie que l'API charge le bon contexte (bornes du cycle, effectifs,
/// cycles voisins), qu'elle numérote, qu'elle déduit le statut, et qu'une
/// suppression descend aux enfants et sort des indicateurs.
///
/// Prérequis : `pnpm dev:api` et `pnpm db:seed`.

import { Pool } from 'pg';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { authentifierEnAdmin } from './session.js';

process.loadEnvFile(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env'),
);

const API = process.env['E2E_API_URL'] ?? 'http://localhost:3000/api';
const FERME_TEST = 'Ferme parcours contrôles';

const resultats: { libelle: string; ok: boolean; detail: string }[] = [];
function verifier(libelle: string, obtenu: unknown, attendu: unknown) {
  resultats.push({ libelle, ok: obtenu === attendu, detail: `obtenu=${String(obtenu)}  attendu=${String(attendu)}` });
}

type Corps = Record<string, any>;

async function appel(methode: string, chemin: string, corps?: unknown) {
  const reponse = await fetch(`${API}${chemin}`, {
    method: methode,
    ...(corps === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }),
  });
  const texte = await reponse.text();
  return { statut: reponse.status, corps: (texte ? JSON.parse(texte) : {}) as Corps };
}

/// Création qui doit réussir : un échec interrompt le parcours avec le message de l'API.
async function creer(ressource: string, donnees: unknown): Promise<Corps> {
  const r = await appel('POST', `/saisie/${ressource}`, donnees);
  if (r.statut !== 201) throw new Error(`POST ${ressource} → ${r.statut} ${JSON.stringify(r.corps)}`);
  return r.corps;
}

/// Code renvoyé par un refus, ou le statut HTTP si la requête est passée.
async function refus(methode: string, chemin: string, corps?: unknown) {
  const r = await appel(methode, chemin, corps);
  return r.statut >= 400 ? String(r.corps['code'] ?? r.statut) : `accepté (${r.statut})`;
}

async function nettoyer() {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  try {
    await pool.query('DELETE FROM "Ferme" WHERE nom = $1', [FERME_TEST]);
  } finally {
    await pool.end();
  }
}

async function enBase(sql: string, parametres: unknown[]) {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  try {
    return (await pool.query(sql, parametres)).rows;
  } finally {
    await pool.end();
  }
}

async function parcours() {
  const especes = (await appel('GET', '/referentiels/especes?_end=200')).corps as unknown as Corps[];
  const tilapia = especes.find((e) => e['codeFao'] === 'TLN')!['id'];
  const type = ((await appel('GET', '/referentiels/types-infrastructure?_end=1')).corps as unknown as Corps[])[0]!['id'];

  const ferme = await creer('fermes', { nom: FERME_TEST });
  const bassin = await creer('infrastructures', { nom: 'C1', fermeId: ferme['id'], typeInfrastructureId: type, longueur: 10, largeur: 10 });

  // --- Numérotation et statut ---
  const c1 = await creer('cycles', { infrastructureId: bassin['id'], dateMiseEnCharge: '2025-01-10', especeId: tilapia });
  verifier('cycle numéroté automatiquement', c1['numero'], 1);
  verifier('statut par défaut', c1['statut'], 'EN_COURS');
  verifier('second cycle ouvert sur le bassin', await refus('POST', '/saisie/cycles', { infrastructureId: bassin['id'], dateMiseEnCharge: '2025-02-01' }), 'CYCLE_DEJA_OUVERT');
  verifier('bassin négatif refusé', await refus('POST', '/saisie/infrastructures', { nom: 'C9', fermeId: ferme['id'], typeInfrastructureId: type, profondeur: -1 }), 'VALEUR_NON_POSITIVE');

  const lot = await creer('lots', { cycleId: c1['id'], especeId: tilapia, nombre: 100, poidsMoyenG: 10, coutUnitaire: 50, dateMiseEnCharge: '2025-01-10' });
  verifier('lot avant la mise en charge', await refus('POST', '/saisie/lots', { cycleId: c1['id'], especeId: tilapia, nombre: 10, poidsMoyenG: 10, dateMiseEnCharge: '2025-01-01' }), 'DATE_AVANT_MISE_EN_CHARGE');

  // --- Mortalités bornées par l'effectif ---
  await creer('mortalites', { lotId: lot['id'], dateConstat: '2025-01-20', nombre: 90 });
  verifier('plus de morts que de poissons', await refus('POST', '/saisie/mortalites', { lotId: lot['id'], dateConstat: '2025-01-21', nombre: 11 }), 'MORTALITE_SUPERIEURE_EFFECTIF');
  verifier('les 10 restants peuvent mourir', (await appel('POST', '/saisie/mortalites', { lotId: lot['id'], dateConstat: '2025-01-21', nombre: 10 })).statut, 201);
  verifier('récolter des poissons morts', await refus('POST', '/saisie/recoltes', { cycleId: c1['id'], lotId: lot['id'], dateOperation: '2025-03-01', type: 'VENTE', poidsKg: 5, nombre: 1 }), 'RECOLTE_SUPERIEURE_EFFECTIF');

  // --- Pesées : numéro, bornes, rattachement ---
  const lot2 = await creer('lots', { cycleId: c1['id'], especeId: tilapia, nombre: 200, poidsMoyenG: 10, dateMiseEnCharge: '2025-01-10' });
  const p1 = await creer('pesees', { cycleId: c1['id'], dateOperation: '2025-02-10' });
  const p2 = await creer('pesees', { cycleId: c1['id'], dateOperation: '2025-03-10' });
  verifier('pesées numérotées 1 puis 2', `${p1['numero']},${p2['numero']}`, '1,2');
  verifier('pesée avant la mise en charge', await refus('POST', '/saisie/pesees', { cycleId: c1['id'], dateOperation: '2024-12-31' }), 'DATE_AVANT_MISE_EN_CHARGE');
  verifier('pesée dans le futur', await refus('POST', '/saisie/pesees', { cycleId: c1['id'], dateOperation: '2099-01-01' }), 'DATE_FUTURE');
  await creer('echantillons', { peseeId: p1['id'], lotId: lot2['id'], nombre: 10, poidsTotalG: 500 });
  await creer('echantillons', { peseeId: p2['id'], lotId: lot2['id'], nombre: 10, poidsTotalG: 1000 });
  verifier('kilos saisis en grammes', await refus('POST', '/saisie/echantillons', { peseeId: p2['id'], lotId: lot2['id'], nombre: 1, poidsTotalG: 350000 }), 'POIDS_INVRAISEMBLABLE');
  verifier('modification contrôlée aussi', await refus('PATCH', `/saisie/pesees/${p2['id']}`, { dateOperation: '2024-01-01' }), 'DATE_AVANT_MISE_EN_CHARGE');

  // --- Bug corrigé : une pesée supprimée ne compte plus ---
  const avant = (await appel('GET', `/cycles/${c1['id']}/indicateurs`)).corps;
  verifier('poids final pris sur la pesée 2', avant['zootechnie']?.['poidsMoyenFinalG'], 100);
  await appel('DELETE', `/saisie/pesees/${p2['id']}`);
  const apres = (await appel('GET', `/cycles/${c1['id']}/indicateurs`)).corps;
  verifier('pesée supprimée écartée des indicateurs', apres['zootechnie']?.['poidsMoyenFinalG'], 50);
  const echantillonsP2 = await enBase('SELECT "deletedAt" FROM "Echantillon" WHERE "peseeId" = $1', [p2['id']]);
  verifier('échantillons supprimés avec la pesée', echantillonsP2.every((e) => e.deletedAt !== null), true);

  // --- Clôture ---
  verifier('clôture avant la dernière pesée', await refus('PATCH', `/saisie/cycles/${c1['id']}`, { dateCloture: '2025-02-01' }), 'OPERATIONS_APRES_CLOTURE');
  verifier('bouclé sans date', await refus('PATCH', `/saisie/cycles/${c1['id']}`, { statut: 'BOUCLE' }), 'CLOTURE_SANS_DATE');
  const clos = await appel('PATCH', `/saisie/cycles/${c1['id']}`, { dateCloture: '2025-04-30' });
  verifier('clôture → statut bouclé déduit', clos.corps['statut'], 'BOUCLE');
  verifier('pesée après la clôture', await refus('POST', '/saisie/pesees', { cycleId: c1['id'], dateOperation: '2025-05-05' }), 'DATE_APRES_CLOTURE');
  verifier('dépense de préparation avant la charge', (await appel('POST', '/saisie/depenses', { cycleId: c1['id'], categorie: 'AUTRE', montant: 5000, dateOperation: '2025-01-02' })).statut, 201);

  // --- Cycle suivant ---
  verifier('cycle qui chevauche le précédent', await refus('POST', '/saisie/cycles', { infrastructureId: bassin['id'], dateMiseEnCharge: '2025-04-15' }), 'CHEVAUCHEMENT_CYCLES');
  const c2 = await creer('cycles', { infrastructureId: bassin['id'], dateMiseEnCharge: '2025-05-15' });
  verifier('cycle suivant numéroté 2', c2['numero'], 2);
  const pesee2 = await creer('pesees', { cycleId: c2['id'], dateOperation: '2025-06-01' });
  verifier('échantillon d’un lot d’un autre cycle', await refus('POST', '/saisie/echantillons', { peseeId: pesee2['id'], lotId: lot2['id'], nombre: 5, poidsTotalG: 100 }), 'RATTACHEMENT_INCOHERENT');
  verifier('mesure d’eau à pH 72', await refus('POST', '/saisie/mesures-eau', { infrastructureId: bassin['id'], cycleId: c2['id'], dateMesure: '2025-06-01', ph: 72 }), 'VALEUR_HORS_BORNES');

  // --- Délai d'attente : toujours recalculé quand le produit est connu ---
  const produit = ((await appel('GET', '/referentiels/produits-sanitaires?_end=200')).corps as unknown as Corps[])
    .find((p) => Number(p['delaiAttenteJours']) > 0)!;
  const traitement = await creer('traitements', {
    cycleId: c2['id'],
    produitSanitaireId: produit['id'],
    dateOperation: '2025-06-01',
    finDelaiAttente: '2025-06-02',
  });
  const fin = new Date(Date.parse('2025-06-01T00:00:00Z') + Number(produit['delaiAttenteJours']) * 86_400_000)
    .toISOString().slice(0, 10);
  verifier('délai d’attente forgé par le client ignoré', traitement['finDelaiAttente'], fin);

  // --- Suppression en cascade ---
  await appel('DELETE', `/saisie/cycles/${c1['id']}`);
  const lots = (await appel('GET', `/saisie/lots?cycleId=${c1['id']}`)).corps as unknown as Corps[];
  verifier('lots du cycle supprimé hors des listes', lots.length, 0);
  const morts = await enBase('SELECT count(*)::int AS n FROM "Mortalite" WHERE "lotId" = $1 AND "deletedAt" IS NULL', [lot['id']]);
  verifier('mortalités supprimées en cascade (petits-enfants)', morts[0].n, 0);
  const dates = await enBase('SELECT DISTINCT "deletedAt" FROM "Lot" WHERE "cycleId" = $1', [c1['id']]);
  verifier('une seule date de suppression pour tout l’arbre', dates.length, 1);
  verifier('le cycle suivant est intact', (await appel('GET', `/saisie/cycles/${c2['id']}`)).statut, 200);
}

if (!(await fetch(`${API}/sante`).then((r) => r.ok).catch(() => false))) {
  console.error(`API injoignable sur ${API}. Lancez-la avec « pnpm dev:api ».`);
  process.exit(1);
}
await authentifierEnAdmin(API);

await nettoyer();
try {
  await parcours();
} catch (e) {
  resultats.push({ libelle: 'parcours interrompu', ok: false, detail: (e as Error).message });
} finally {
  await nettoyer();
}

for (const { libelle, ok, detail } of resultats) {
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${libelle.padEnd(48)} ${detail}`);
}
const echecs = resultats.filter((r) => !r.ok).length;
console.log(echecs === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${echecs} CONTROLE(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
