/// Administration (étape 6) : comptes, affectations, conflits, consolidation.
///
/// Un administrateur crée un encadreur, lui confie la ferme d'un particulier,
/// la lui retire, change son mot de passe, le désactive. Un conflit de
/// synchronisation apparaît dans l'écran des conflits et se traite. La
/// consolidation régionale compte la production de la ferme, et un
/// particulier n'y voit que la sienne.
///
/// Prérequis : API et admin.

import { Pool } from 'pg';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ouvrirNavigateur, OUTILS_SAISIE, type Navigateur } from './navigateur.ts';
import { connecterNavigateur, connexion } from './session.js';

process.loadEnvFile(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env'),
);

const API = process.env['E2E_API_URL'] ?? 'http://localhost:3000/api';
const ADMIN = process.env['E2E_ADMIN_URL'] ?? 'http://localhost:5173';
const NOM_TEST = 'Parcours administration';

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
  await sql(`DELETE FROM "ConflitSync" WHERE "userId" IN (SELECT id FROM "User" WHERE nom LIKE $1)`, [`${NOM_TEST}%`]);
  await sql('DELETE FROM "Ferme" WHERE nom LIKE $1', [`${NOM_TEST}%`]);
  await sql('DELETE FROM "User" WHERE nom LIKE $1', [`${NOM_TEST}%`]);
}

type Corps = Record<string, any>;
const numero = () => `+2233${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;

function client(jeton: string) {
  return async (methode: string, chemin: string, corps?: unknown) => {
    const r = await fetch(`${API}${chemin}`, {
      method: methode,
      headers: { Authorization: `Bearer ${jeton}`, ...(corps !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
    });
    const texte = await r.text();
    return { statut: r.status, corps: (texte ? JSON.parse(texte) : {}) as Corps & Corps[] };
  };
}

async function parcours() {
  const admin = client((await connexion(API, process.env['AQUA_ADMIN_TELEPHONE']!, process.env['AQUA_ADMIN_MOT_DE_PASSE']!)).jetonAcces);

  // --- Un particulier et sa ferme ---
  const telA = numero();
  const inscA = (await (await fetch(`${API}/auth/inscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom: `${NOM_TEST} A`, telephone: telA, motDePasse: 'particulier-2026', appareil: { libelle: 'Téléphone A' } }),
  })).json()) as Corps;
  const a = client(inscA['jetonAcces']);
  verifier('particulier → /admin refusé', (await a('GET', '/admin/utilisateurs')).corps['code'], 'ROLE_INSUFFISANT');

  const regions = (await a('GET', '/geographie/regions')).corps as Corps[];
  const sikasso = regions.find((r) => r['nom'] === 'Sikasso')!;
  const tilapia = ((await a('GET', '/referentiels/especes?_end=50')).corps as Corps[]).find((e) => e['codeFao'] === 'TLN')!['id'];
  const type = ((await a('GET', '/referentiels/types-infrastructure?_end=1')).corps as Corps[])[0]!['id'];
  const ferme = (await a('POST', '/saisie/fermes', { nom: `${NOM_TEST} ferme`, regionId: sikasso['id'] })).corps;
  const bassin = (await a('POST', '/saisie/infrastructures', { nom: 'K1', fermeId: ferme['id'], typeInfrastructureId: type, longueur: 10, largeur: 10 })).corps;
  const cycle = (await a('POST', '/saisie/cycles', { infrastructureId: bassin['id'], dateMiseEnCharge: '2025-03-01', especeId: tilapia })).corps;
  const lot = (await a('POST', '/saisie/lots', { cycleId: cycle['id'], especeId: tilapia, nombre: 500, poidsMoyenG: 5, coutUnitaire: 100, dateMiseEnCharge: '2025-03-01' })).corps;
  await a('POST', '/saisie/recoltes', { cycleId: cycle['id'], lotId: lot['id'], dateOperation: '2025-08-20', type: 'VENTE', poidsKg: 150, prixKg: 1600 });
  await a('PATCH', `/saisie/cycles/${cycle['id']}`, { dateCloture: '2025-08-31' });

  // --- Comptes ---
  const telE = numero();
  const e = (await admin('POST', '/admin/utilisateurs', { nom: `${NOM_TEST} E`, telephone: telE, role: 'ENCADREUR', motDePasse: 'encadreur-2026' })).corps;
  verifier('admin crée un encadreur', e['role'], 'ENCADREUR');
  verifier('le mot de passe n’est jamais renvoyé', 'motDePasse' in e, false);
  verifier('téléphone déjà pris → 409', (await admin('POST', '/admin/utilisateurs', { nom: 'doublon', telephone: telE, role: 'ENCADREUR', motDePasse: 'encadreur-2026' })).corps['code'], 'COMPTE_EXISTANT');
  verifier('création sans mot de passe refusée', (await admin('POST', '/admin/utilisateurs', { nom: 'sans', telephone: numero(), role: 'ENCADREUR' })).statut, 400);
  const sessionE = await connexion(API, telE, 'encadreur-2026');
  const cE = client(sessionE.jetonAcces);
  verifier('l’encadreur se connecte', (await cE('GET', '/auth/moi')).corps['role'], 'ENCADREUR');
  verifier('sans affectation, aucune ferme', ((await cE('GET', '/saisie/fermes')).corps as Corps[]).length, 0);
  verifier('recherche par téléphone', ((await admin('GET', `/admin/utilisateurs?q=${encodeURIComponent(telE)}`)).corps as Corps[]).length, 1);

  // --- Affectations ---
  const acces = (await admin('POST', '/admin/acces', { userId: e['id'], fermeId: ferme['id'], niveau: 'ENCADREUR' })).corps;
  verifier('affectation créée', acces['niveau'], 'ENCADREUR');
  verifier('l’encadreur voit la ferme confiée', ((await cE('GET', '/saisie/fermes')).corps as Corps[]).map((f) => f['id']).join(), ferme['id']);
  verifier('et peut y saisir', (await cE('POST', '/saisie/infrastructures', { nom: 'K2', fermeId: ferme['id'], typeInfrastructureId: type })).statut, 201);
  await admin('PATCH', `/admin/acces/${acces['id']}`, { finLe: '2025-01-01' });
  verifier('affectation échue : plus rien', ((await cE('GET', '/saisie/fermes')).corps as Corps[]).length, 0);
  await admin('PATCH', `/admin/acces/${acces['id']}`, { finLe: '' });
  verifier('affectation rouverte', ((await cE('GET', '/saisie/fermes')).corps as Corps[]).length, 1);
  await admin('DELETE', `/admin/acces/${acces['id']}`);
  verifier('affectation retirée : effet immédiat', ((await cE('GET', '/saisie/fermes')).corps as Corps[]).length, 0);

  // --- Mot de passe et désactivation coupent les sessions ---
  await admin('PATCH', `/admin/utilisateurs/${e['id']}`, { motDePasse: 'nouveau-2026-secret' });
  const rafraichir = await fetch(`${API}/auth/rafraichir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jetonRafraichissement: sessionE.jetonRafraichissement }),
  });
  verifier('mot de passe changé : sessions coupées', rafraichir.status, 401);
  verifier('nouveau mot de passe accepté', (await connexion(API, telE, 'nouveau-2026-secret')).jetonAcces.length > 20, true);
  await admin('DELETE', `/admin/utilisateurs/${e['id']}`);
  const refus = await fetch(`${API}/auth/connexion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifiant: telE, motDePasse: 'nouveau-2026-secret' }),
  });
  verifier('compte désactivé : connexion refusée', refus.status, 401);
  verifier('mais toujours listé (rien n’est supprimé)', (await admin('GET', `/admin/utilisateurs/${e['id']}`)).corps['actif'], false);

  // --- Conflit : même pesée modifiée par deux appareils du particulier ---
  const p = (await a('POST', '/saisie/pesees', { cycleId: cycle['id'], dateOperation: '2025-06-01', tauxRationPct: 2 })).corps;
  await a('POST', '/sync/push', { changements: [{ ressource: 'pesees', id: p['id'], operation: 'ecrire', donnees: { tauxRationPct: 3 }, versionBase: p['updatedAt'] }] });
  await a('POST', '/sync/push', { changements: [{ ressource: 'pesees', id: p['id'], operation: 'ecrire', donnees: { tauxRationPct: 1 }, versionBase: p['updatedAt'], modifieLe: '2020-01-01T00:00:00.000Z' }] });
  const conflits = (await admin('GET', '/admin/conflits?resolu=false&_end=200')).corps as Corps[];
  const conflit = conflits.find((c) => c['enregistrement'] === p['id']);
  verifier('conflit listé, avec son auteur', conflit?.['auteur'], `${NOM_TEST} A`);

  // --- Consolidation ---
  const conso = (await admin('GET', '/consolidation?niveau=region&depuis=2025-01-01&jusqua=2025-12-31')).corps;
  const ligne = (conso['lignes'] as Corps[]).find((l) => l['territoire'] === 'Sikasso');
  verifier('consolidation : production de la région', (ligne?.['productionKg'] ?? 0) >= 150, true);
  const consoA = (await a('GET', '/consolidation?niveau=region&depuis=2025-01-01&jusqua=2025-12-31')).corps;
  verifier('un particulier ne consolide que sa ferme', (consoA['lignes'] as Corps[]).map((l) => `${l['territoire']}:${l['fermes']}:${l['productionKg']}`).join(), 'Sikasso:1:150');
  verifier('niveau inconnu refusé', (await admin('GET', '/consolidation?niveau=pays')).statut, 400);

  // --- Écrans de l'admin ---
  let nav: Navigateur | undefined;
  try {
    nav = await ouvrirNavigateur(9351);
    await connecterNavigateur(nav, ADMIN, OUTILS_SAISIE);
    const ev = <T>(js: string) => nav!.evaluer<T>(js);

    await nav.aller(`${ADMIN}/administration/utilisateurs/nouveau`);
    await nav.attendre(`!!document.getElementById('role')`, 'formulaire utilisateur');
    await ev(OUTILS_SAISIE);
    const telF = numero();
    for (const [id, v] of Object.entries({ nom: `${NOM_TEST} F`, telephone: telF, role: 'SECTEUR', motDePasse: 'secteur-2026-ok' })) {
      await ev(`window.__saisir(${JSON.stringify(id)}, ${JSON.stringify(v)})`);
    }
    await nav.attendre(`document.getElementById('regionId')?.options.length > 1`, 'régions proposées');
    await ev(`window.__saisir('regionId', ${JSON.stringify(sikasso['id'])})`);
    verifier('mot de passe masqué', await ev<string>(`document.getElementById('motDePasse').type`), 'password');
    await ev(`document.querySelector('[data-test=enregistrer]').click(), true`);
    await nav.attendre(`location.pathname === '/administration/utilisateurs' && !!window.__ligne && true`, 'retour à la liste');
    await ev(OUTILS_SAISIE);
    await nav.attendre(`!!window.__ligne(${JSON.stringify(`${NOM_TEST} F`)})`, 'utilisateur listé');
    verifier('admin : utilisateur créé par le formulaire', (await ev<string>(`window.__ligne(${JSON.stringify(`${NOM_TEST} F`)})`)).includes('Sikasso'), true);
    // Le profil SECTEUR lit sa région : la ferme de Sikasso, sans affectation.
    const f = client((await connexion(API, telF, 'secteur-2026-ok')).jetonAcces);
    verifier('profil SECTEUR : lit les fermes de sa région', ((await f('GET', '/saisie/fermes')).corps as Corps[]).some((x) => x['id'] === ferme['id']), true);
    verifier('mais n’y écrit pas', (await f('PATCH', `/saisie/fermes/${ferme['id']}`, { nom: 'x' })).corps['code'], 'LECTURE_SEULE');

    await nav.aller(`${ADMIN}/conflits`);
    await nav.attendre(`!!document.querySelector('[data-test=conflit]')`, 'écran des conflits');
    verifier('admin : différence affichée', await ev<boolean>(`document.querySelector('[data-test=conflit]').innerText.includes('tauxRationPct')`), true);
    const avant = await ev<number>(`document.querySelectorAll('[data-test=conflit]').length`);
    await ev(`[...document.querySelectorAll('[data-test=conflit]')].find(c => c.innerText.includes('${NOM_TEST} A')).querySelector('[data-test=marquer]').click(), true`);
    await nav.attendre(`document.querySelectorAll('[data-test=conflit]').length < ${avant} || !!document.querySelector('[data-test=vide]')`, 'conflit traité');
    verifier('admin : conflit marqué traité', (await sql('SELECT resolu FROM "ConflitSync" WHERE enregistrement = $1', [p['id']]))[0]?.resolu, true);

    await nav.aller(`${ADMIN}/consolidation`);
    await ev(OUTILS_SAISIE);
    await ev(`window.__saisir('depuis', '2025-01-01')`);
    await ev(`window.__saisir('jusqua', '2025-12-31')`);
    await nav.attendre(`[...document.querySelectorAll('[data-test=territoire]')].some(l => l.innerText.includes('Sikasso'))`, 'consolidation affichée');
    verifier('admin : consolidation par région', true, true);
  } finally {
    await nav?.fermer();
  }
}

if (!(await fetch(`${API}/sante`).then((r) => r.ok).catch(() => false)) || !(await fetch(ADMIN).then((r) => r.ok).catch(() => false))) {
  console.error(`API (${API}) et admin (${ADMIN}) doivent tourner.`);
  process.exit(1);
}

await nettoyer();
try {
  await parcours();
} catch (err) {
  resultats.push({ libelle: 'parcours interrompu', ok: false, detail: (err as Error).message });
} finally {
  await nettoyer();
}

for (const { libelle, ok, detail } of resultats) {
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${libelle.padEnd(50)} ${detail}`);
}
const echecs = resultats.filter((r) => !r.ok).length;
console.log(echecs === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${echecs} CONTROLE(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
