/// Simulation (étape 9) de bout en bout.
///
/// Les chiffres eux-mêmes sont vérifiés dans `packages/shared/test/simulation.ts`
/// (dont le critère « même code qu'un cycle réel »). Ici : l'API calcule avec
/// les repères de la base, enregistre chez son auteur seulement, et la PWA
/// donne **hors ligne** le même résultat que l'API ; l'admin aussi.
///
/// Prérequis : API, admin, PWA construite et servie.

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
const NOM_TEST = 'Parcours simulation';
const MOT_DE_PASSE = 'bassin-simul-2026';

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

const nettoyer = () => sql('DELETE FROM "User" WHERE nom = $1', [NOM_TEST]);
const numero = () => `+2234${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
type Corps = Record<string, any>;

async function compte() {
  const telephone = numero();
  const s = (await (await fetch(`${API}/auth/inscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom: NOM_TEST, telephone, motDePasse: MOT_DE_PASSE }),
  })).json()) as Corps;
  const appel = async (methode: string, chemin: string, corps?: unknown) => {
    const r = await fetch(`${API}${chemin}`, {
      method: methode,
      headers: { Authorization: `Bearer ${s['jetonAcces']}`, ...(corps ? { 'Content-Type': 'application/json' } : {}) },
      ...(corps ? { body: JSON.stringify(corps) } : {}),
    });
    return { statut: r.status, corps: (await r.json()) as Corps };
  };
  return { telephone, appel };
}

const lireNombre = (t: string) => Number(t.replace(/[^\d,-]/g, '').replace(',', '.'));

async function parcours() {
  const a = await compte();
  const b = await compte();
  const especes = (await a.appel('GET', '/referentiels/especes?_end=50')).corps as unknown as Corps[];
  const types = (await a.appel('GET', '/referentiels/types-infrastructure?_end=50')).corps as unknown as Corps[];
  const tilapia = especes.find((e) => e['codeFao'] === 'TLN')!;
  const etang = types.find((t) => t['code'] === 'RIZIPISCICULTURE')!;
  const parametres = {
    capital: 500000, especeId: tilapia['id'], typeInfrastructureId: etang['id'], taille: 100,
    densite: 10, poidsCibleG: 350, prixAlevin: 110, prixAlimentKg: 500, prixVenteKg: 1750, autresCharges: 115000,
  };

  // --- API ---
  const calcul = await a.appel('POST', '/simulations/calculer', parametres);
  verifier('API : calcul', calcul.statut, 200);
  const api = calcul.corps;
  verifier('API : 1 000 alevins', api['projection']?.['effectifInitial'], 1000);
  verifier('API : production cohérente', api['projection']?.['productionKg'] > 0, true);
  verifier('API : cycle projeté fourni', api['cycleProjete']?.['cycle']?.['statut'], 'BOUCLE');
  verifier('API : paramètre manquant refusé', (await a.appel('POST', '/simulations/calculer', { ...parametres, prixVenteKg: undefined })).corps['code'], 'CHAMPS_INVALIDES');
  // Saisie telle que l'écran l'envoie, à la française : « 500 000 », « 12,5 ».
  const francais = await a.appel('POST', '/simulations/calculer', {
    ...parametres,
    capital: String(parametres.capital).replace(/\B(?=(\d{3})+$)/g, ' '),
    densite: '12,5',
  });
  verifier('API : « 500 000 » et « 12,5 » acceptés', `${francais.statut} ${francais.corps['projection']?.['densite']}`, '200 12.5');
  verifier(
    'API : saisie illisible expliquée en français',
    (await a.appel('POST', '/simulations/calculer', { ...parametres, taille: 'cent' })).corps['message'],
    'Surface ou volume : nombre attendu, par exemple 12,5 ou 500 000',
  );
  verifier('API : repère manquant expliqué', (await a.appel('POST', '/simulations/calculer', { ...parametres, especeId: 'inexistante' })).corps['code'], 'SIMULATION_IMPOSSIBLE');

  const enreg = await a.appel('POST', '/simulations', { nom: 'Étang de 100 m²', parametres });
  verifier('API : enregistrement', enreg.statut, 201);
  verifier('API : résultat enregistré sans le cycle projeté', enreg.corps['resultats']?.['cycleProjete'], undefined);
  verifier('API : l’auteur la retrouve', ((await a.appel('GET', '/simulations')).corps as unknown as Corps[]).length, 1);
  verifier('API : un autre compte ne la voit pas', ((await b.appel('GET', '/simulations')).corps as unknown as Corps[]).length, 0);
  verifier('API : ni en accès direct', (await b.appel('GET', `/simulations/${enreg.corps['id']}`)).statut, 404);

  // --- PWA, hors ligne : même calcul, même résultat ---
  let nav: Navigateur | undefined;
  try {
    nav = await ouvrirNavigateur(9347);
    await nav.aller(`${PWA}/connexion`);
    await nav.attendre(`!!document.querySelector('[data-test=form-connexion]')`, 'connexion PWA');
    await nav.evaluer(OUTILS_SAISIE);
    await nav.evaluer(`window.__saisir('identifiant', ${JSON.stringify(a.telephone)})`);
    await nav.evaluer(`window.__saisir('motDePasse', ${JSON.stringify(MOT_DE_PASSE)})`);
    await nav.evaluer(`document.querySelector('[data-test=valider]').click(), true`);
    await nav.attendre(`!!document.querySelector('[data-test=lien-simuler]')`, 'accueil PWA');
    await nav.attendre(`!(document.querySelector('[data-test=etat-sync]')?.innerText ?? '').includes('Synchronisation')`, 'référentiels chargés');
    await nav.aller(`${PWA}/`);
    await nav.attendre(`!!navigator.serviceWorker.controller`, 'service worker actif');
    await nav.horsLigne(true);
    await nav.aller(`${PWA}/simuler`);
    await nav.attendre(`document.getElementById('champ-especeId')?.options.length > 1`, 'formulaire de simulation hors ligne');
    await nav.evaluer(OUTILS_SAISIE);
    for (const [k, v] of Object.entries(parametres)) {
      await nav.evaluer(`window.__saisir('champ-${k}', ${JSON.stringify(String(v))})`);
    }
    await nav.evaluer(`document.querySelector('[data-test=calculer]').click(), true`);
    await nav.attendre(`!!document.querySelector('[data-test=sim-resultat]')`, 'résultat hors ligne');
    const pwa = lireNombre(await nav.evaluer<string>(`document.querySelector('[data-test=sim-resultat]').innerText`));
    verifier('PWA hors ligne : même résultat que l’API', pwa, api['rentabilite']?.['resultat']);
    verifier('PWA : financement expliqué', (await nav.evaluer<string>(`document.querySelector('[data-test=financement]').innerText`)).includes('capital suffit'), true);
  } finally {
    await nav?.fermer();
  }

  // --- Admin ---
  nav = undefined;
  try {
    nav = await ouvrirNavigateur(9349);
    await connecterNavigateur(nav, ADMIN, OUTILS_SAISIE);
    await nav.aller(`${ADMIN}/simulation`);
    await nav.attendre(`document.getElementById('sim-especeId')?.options.length > 1`, 'page de simulation (admin)');
    await nav.evaluer(OUTILS_SAISIE);
    for (const [k, v] of Object.entries(parametres)) {
      await nav.evaluer(`window.__saisir('sim-${k}', ${JSON.stringify(String(v))})`);
    }
    await nav.evaluer(`document.querySelector('[data-test=calculer]').click(), true`);
    await nav.attendre(`!!document.querySelector('[data-test=sim-resultat]')`, 'résultat (admin)');
    const admin = lireNombre(await nav.evaluer<string>(`document.querySelector('[data-test=sim-resultat]').innerText`));
    verifier('admin : même résultat', admin, api['rentabilite']?.['resultat']);
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
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${libelle.padEnd(48)} ${detail}`);
}
const echecs = resultats.filter((r) => !r.ok).length;
console.log(echecs === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${echecs} CONTROLE(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
