/// Moteur d'alertes (étape 8) de bout en bout.
///
/// Critère de fin : un cycle surdensifié déclenche une alerte visible sur
/// mobile et dans l'admin. On ajoute un manque d'oxygène, pour vérifier que
/// les relevés d'eau arrivent jusqu'au moteur des deux côtés.
///
/// Prérequis : API, admin (`pnpm dev:admin`) et PWA construite et servie
/// (`pnpm build:pwa && pnpm preview:pwa`).

import { Pool } from 'pg';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ouvrirNavigateur, OUTILS_SAISIE, type Navigateur } from './navigateur.ts';
import { connecterNavigateur } from './session.js';

process.loadEnvFile(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env'),
);

const API = process.env['E2E_API_URL'] ?? 'http://localhost:3000/api';
const ADMIN = process.env['E2E_ADMIN_URL'] ?? 'http://localhost:5173';
const PWA = process.env['E2E_PWA_URL'] ?? 'http://localhost:5181';
const NOM_TEST = 'Parcours alertes';
const TELEPHONE = `+2235${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
const MOT_DE_PASSE = 'bassin-alerte-2026';

const resultats: { libelle: string; ok: boolean; detail: string }[] = [];
function verifier(libelle: string, obtenu: unknown, attendu: unknown) {
  resultats.push({ libelle, ok: obtenu === attendu, detail: `obtenu=${String(obtenu)}  attendu=${String(attendu)}` });
}

async function sql(requete: string, parametres: unknown[] = []) {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  try {
    return (await pool.query(requete, parametres)).rows;
  } finally {
    await pool.end();
  }
}

async function nettoyer() {
  await sql(
    `DELETE FROM "Ferme" WHERE id IN (
       SELECT a."fermeId" FROM "AccesFerme" a JOIN "User" u ON u.id = a."userId" WHERE u.nom = $1)`,
    [NOM_TEST],
  );
  await sql('DELETE FROM "User" WHERE nom = $1', [NOM_TEST]);
}

type Corps = Record<string, any>;

async function preparer() {
  const inscription = (await (await fetch(`${API}/auth/inscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom: NOM_TEST, telephone: TELEPHONE, motDePasse: MOT_DE_PASSE }),
  })).json()) as Corps;
  const jeton = inscription['jetonAcces'] as string;
  const appel = async (methode: string, chemin: string, corps?: unknown) =>
    (await (await fetch(`${API}${chemin}`, {
      method: methode,
      headers: { Authorization: `Bearer ${jeton}`, ...(corps ? { 'Content-Type': 'application/json' } : {}) },
      ...(corps ? { body: JSON.stringify(corps) } : {}),
    })).json()) as Corps;

  const tilapia = ((await appel('GET', '/referentiels/especes?_end=50')) as unknown as Corps[]).find((e) => e['codeFao'] === 'TLN')!['id'];
  const type = ((await appel('GET', '/referentiels/types-infrastructure?_end=50')) as unknown as Corps[]).find((t) => t['code'] === 'RIZIPISCICULTURE')!['id'];
  const ferme = await appel('POST', '/saisie/fermes', { nom: `${NOM_TEST} ferme` });
  const bassin = await appel('POST', '/saisie/infrastructures', { nom: 'D1', fermeId: ferme['id'], typeInfrastructureId: type, longueur: 10, largeur: 10 });
  const hier = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const debut = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
  const cycle = await appel('POST', '/saisie/cycles', { infrastructureId: bassin['id'], dateMiseEnCharge: debut, especeId: tilapia });
  // 4 000 alevins sur 100 m² : 40/m² pour un maximum de 25 → critique.
  await appel('POST', '/saisie/lots', { cycleId: cycle['id'], especeId: tilapia, nombre: 4000, poidsMoyenG: 5, dateMiseEnCharge: debut });
  await appel('POST', '/saisie/mesures-eau', { infrastructureId: bassin['id'], cycleId: cycle['id'], dateMesure: hier, heure: '06:00', oxygeneDissous: 1.8, temperature: 28 });
  return { appel, cycleId: cycle['id'] as string };
}

async function parcours() {
  const { appel, cycleId } = await preparer();

  // --- API ---
  const alertes = (await appel('GET', `/cycles/${cycleId}/alertes`)) as unknown as Corps[];
  const codes = alertes.map((a) => a['code']);
  verifier('API : densité excessive', codes.includes('DENSITE_EXCESSIVE'), true);
  verifier('API : oxygène bas', codes.includes('OXYGENE_BAS'), true);
  verifier('API : critiques en tête', alertes[0]?.['niveau'], 'critique');
  const enCours = (await appel('GET', '/alertes')) as unknown as Corps[];
  verifier('API : cycle dans le tableau de bord', enCours.some((c) => c['cycleId'] === cycleId), true);

  // --- Admin ---
  let nav: Navigateur | undefined;
  try {
    nav = await ouvrirNavigateur(9343);
    await connecterNavigateur(nav, ADMIN, OUTILS_SAISIE);
    await nav.aller(`${ADMIN}/cycles/${cycleId}`);
    await nav.attendre(`!!document.querySelector('[data-test=alerte][data-code=DENSITE_EXCESSIVE]')`, 'alerte dans la fiche du cycle (admin)');
    verifier('admin : alerte de densité sur la fiche', true, true);
    await nav.aller(`${ADMIN}/`);
    await nav.attendre(`!!document.querySelector('[data-test=alertes-en-cours]')`, 'tableau des alertes (admin)');
    verifier('admin : tableau des alertes en cours', await nav.evaluer<boolean>(`document.querySelector('[data-test=alertes-en-cours]').innerText.includes('${NOM_TEST} ferme')`), true);
  } finally {
    await nav?.fermer();
  }

  // --- PWA : calcul local, après une synchronisation ---
  nav = undefined;
  try {
    nav = await ouvrirNavigateur(9345);
    await nav.aller(`${PWA}/connexion`);
    await nav.attendre(`!!document.querySelector('[data-test=form-connexion]')`, 'connexion PWA');
    await nav.evaluer(OUTILS_SAISIE);
    await nav.evaluer(`window.__saisir('identifiant', ${JSON.stringify(TELEPHONE)})`);
    await nav.evaluer(`window.__saisir('motDePasse', ${JSON.stringify(MOT_DE_PASSE)})`);
    await nav.evaluer(`document.querySelector('[data-test=valider]').click(), true`);
    await nav.attendre(`document.querySelector('[data-test=titre]')?.innerText === 'Mes fermes' && !!document.querySelector('[data-test=ferme]')`, 'fermes reçues');
    await nav.aller(`${PWA}/cycles/${cycleId}`);
    await nav.attendre(`!!document.querySelector('[data-test=alerte][data-code=DENSITE_EXCESSIVE]')`, 'alerte de densité sur mobile');
    verifier('mobile : alerte de densité', true, true);
    verifier('mobile : alerte d’oxygène', await nav.evaluer<boolean>(`!!document.querySelector('[data-test=alerte][data-code=OXYGENE_BAS]')`), true);
  } finally {
    await nav?.fermer();
  }
}

const joignable = async (url: string) => fetch(url).then((r) => r.ok).catch(() => false);
if (!(await joignable(`${API}/sante`)) || !(await joignable(ADMIN)) || !(await joignable(PWA))) {
  console.error(`API (${API}), admin (${ADMIN}) et PWA (${PWA}) doivent tourner.`);
  process.exit(1);
}

await nettoyer();
try {
  await parcours();
} catch (e) {
  resultats.push({ libelle: 'parcours interrompu', ok: false, detail: (e as Error).message });
} finally {
  await nettoyer();
}

for (const { libelle, ok, detail } of resultats) {
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${libelle.padEnd(44)} ${detail}`);
}
const echecs = resultats.filter((r) => !r.ok).length;
console.log(echecs === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${echecs} CONTROLE(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
