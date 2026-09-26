/// Authentification et cloisonnement des fermes (D18, D19).
///
/// Deux particuliers s'inscrivent. Chacun doit voir **ses** fermes et rien
/// d'autre, ne jamais pouvoir s'accrocher à celles du voisin, et ne pas
/// toucher aux référentiels. Le jeton de rafraîchissement tourne, tolère un
/// rejeu immédiat (réseau perdu) et révoque tout en cas de rejeu tardif.
///
/// Prérequis : `pnpm dev:api` et `pnpm db:seed` (compte administrateur).

import { Pool } from 'pg';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { connexion } from './session.js';

process.loadEnvFile(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env'),
);

const API = process.env['E2E_API_URL'] ?? 'http://localhost:3000/api';
const NOM_TEST = 'Parcours auth';

const resultats: { libelle: string; ok: boolean; detail: string }[] = [];
function verifier(libelle: string, obtenu: unknown, attendu: unknown) {
  resultats.push({
    libelle,
    ok: obtenu === attendu,
    detail: `obtenu=${String(obtenu)}  attendu=${String(attendu)}`,
  });
}

interface Reponse {
  statut: number;
  corps: Record<string, unknown> & Record<string, unknown>[];
}

async function appel(methode: string, chemin: string, corps?: unknown, jeton?: string): Promise<Reponse> {
  const entetes: Record<string, string> = {};
  if (corps !== undefined) entetes['Content-Type'] = 'application/json';
  if (jeton) entetes['Authorization'] = `Bearer ${jeton}`;
  const reponse = await fetch(`${API}${chemin}`, {
    method: methode,
    headers: entetes,
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });
  const texte = await reponse.text();
  return { statut: reponse.status, corps: texte ? JSON.parse(texte) : {} };
}

interface Session {
  jetonAcces: string;
  jetonRafraichissement: string;
  appareilId: string | null;
  utilisateur: { id: string; role: string };
}

/// Numéro jetable : huit chiffres après l'indicatif, préfixe réservé au test.
const numero = () => `+2239${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;

async function nettoyer() {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  try {
    await pool.query(
      `DELETE FROM "Ferme" WHERE id IN (
         SELECT a."fermeId" FROM "AccesFerme" a JOIN "User" u ON u.id = a."userId" WHERE u.nom = $1)`,
      [NOM_TEST],
    );
    await pool.query('DELETE FROM "User" WHERE nom = $1', [NOM_TEST]);
  } finally {
    await pool.end();
  }
}

async function vieillirRemplacement(famille: string) {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  try {
    await pool.query(
      `UPDATE "JetonRafraichissement" SET "remplaceLe" = (now() AT TIME ZONE 'UTC') - interval '2 minutes'
       WHERE famille = $1 AND "remplaceLe" IS NOT NULL`,
      [famille],
    );
  } finally {
    await pool.end();
  }
}

async function familleDe(jetonRafraichissement: string) {
  const { createHash } = await import('node:crypto');
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  try {
    const { rows } = await pool.query('SELECT famille FROM "JetonRafraichissement" WHERE empreinte = $1', [
      createHash('sha256').update(jetonRafraichissement).digest('hex'),
    ]);
    return rows[0]?.famille as string;
  } finally {
    await pool.end();
  }
}

async function parcours() {
  // --- Portes fermées par défaut ---
  verifier('santé publique', (await appel('GET', '/sante')).statut, 200);
  const sansJeton = await appel('GET', '/saisie/fermes');
  verifier('saisie sans jeton → 401', sansJeton.statut, 401);
  verifier('code NON_AUTHENTIFIE', sansJeton.corps['code'], 'NON_AUTHENTIFIE');
  const faux = await appel('GET', '/saisie/fermes', undefined, 'abc.def.ghi');
  verifier('jeton forgé → JETON_INVALIDE', faux.corps['code'], 'JETON_INVALIDE');

  // --- Inscription libre ---
  const telA = numero();
  const inscA = await appel('POST', '/auth/inscription', {
    nom: NOM_TEST,
    telephone: telA,
    motDePasse: 'bassin-A-2026',
    appareil: { libelle: 'Téléphone A', plateforme: 'android' },
  });
  verifier('inscription → 201', inscA.statut, 201);
  const a = inscA.corps as unknown as Session;
  verifier('rôle imposé PISCICULTEUR', a.utilisateur?.role, 'PISCICULTEUR');
  verifier('appareil enregistré', typeof a.appareilId, 'string');

  const espace = telA.replace(/(\d{2})(?=\d)/g, '$1 ');
  const doublon = await appel('POST', '/auth/inscription', {
    nom: NOM_TEST,
    telephone: espace,
    motDePasse: 'autre-mot-de-passe',
  });
  verifier('même numéro, espacé → 409', doublon.statut, 409);
  const role = await appel('POST', '/auth/inscription', {
    nom: NOM_TEST,
    telephone: numero(),
    motDePasse: 'bassin-X-2026',
    role: 'ADMIN',
  });
  verifier('rôle demandé ignoré', (role.corps as unknown as Session).utilisateur?.role, 'PISCICULTEUR');
  verifier('mot de passe court → 400', (await appel('POST', '/auth/inscription', { nom: NOM_TEST, telephone: numero(), motDePasse: 'court' })).statut, 400);

  // --- Connexion ---
  verifier('mauvais mot de passe → 401', (await appel('POST', '/auth/connexion', { identifiant: telA, motDePasse: 'faux-faux-faux' })).corps['code'], 'IDENTIFIANTS_INVALIDES');
  verifier('compte inconnu → même réponse', (await appel('POST', '/auth/connexion', { identifiant: '+22300000001', motDePasse: 'faux-faux-faux' })).corps['code'], 'IDENTIFIANTS_INVALIDES');
  // Force brute : au-delà de la limite (10 par défaut), même le bon mot de
  // passe est refusé pour ce couple adresse × identifiant.
  const cible = numero();
  let code = '';
  for (let i = 0; i < 12 && code !== 'TROP_DE_TENTATIVES'; i++) {
    code = String((await appel('POST', '/auth/connexion', { identifiant: cible, motDePasse: `essai-${i}-faux` })).corps['code']);
  }
  verifier('force brute freinée → TROP_DE_TENTATIVES', code, 'TROP_DE_TENTATIVES');
  verifier('connexion numéro espacé', (await appel('POST', '/auth/connexion', { identifiant: espace, motDePasse: 'bassin-A-2026' })).statut, 200);
  verifier('/auth/moi', (await appel('GET', '/auth/moi', undefined, a.jetonAcces)).corps['id'], a.utilisateur.id);

  // --- Cloisonnement ---
  const fermeA = await appel('POST', '/saisie/fermes', { nom: `${NOM_TEST} A` }, a.jetonAcces);
  verifier('A crée sa ferme', fermeA.statut, 201);
  const fermeAId = fermeA.corps['id'] as string;
  const listeA = await appel('GET', '/saisie/fermes?_end=200', undefined, a.jetonAcces);
  verifier('A voit exactement sa ferme', listeA.corps.map((f) => f['id']).join(), fermeAId);

  const b = (await appel('POST', '/auth/inscription', { nom: NOM_TEST, telephone: numero(), motDePasse: 'bassin-B-2026' })).corps as unknown as Session;
  const listeB = await appel('GET', '/saisie/fermes?_end=200', undefined, b.jetonAcces);
  verifier('B ne voit aucune ferme', listeB.corps.length, 0);
  verifier('B lit la ferme de A → 404', (await appel('GET', `/saisie/fermes/${fermeAId}`, undefined, b.jetonAcces)).statut, 404);
  verifier('B modifie la ferme de A → 404', (await appel('PATCH', `/saisie/fermes/${fermeAId}`, { nom: 'pris' }, b.jetonAcces)).statut, 404);
  verifier('B supprime la ferme de A → 404', (await appel('DELETE', `/saisie/fermes/${fermeAId}`, undefined, b.jetonAcces)).statut, 404);

  const type = (await appel('GET', '/referentiels/types-infrastructure?_end=1', undefined, b.jetonAcces)).corps[0]!;
  const intrus = await appel('POST', '/saisie/infrastructures', { nom: 'intrus', fermeId: fermeAId, typeInfrastructureId: type['id'] }, b.jetonAcces);
  verifier('B s’accroche à la ferme de A → 403', intrus.corps['code'], 'PARENT_INACCESSIBLE');

  const fermeB = (await appel('POST', '/saisie/fermes', { nom: `${NOM_TEST} B` }, b.jetonAcces)).corps['id'] as string;
  const deplace = await appel('PATCH', `/saisie/fermes/${fermeB}`, { acces: { create: { userId: b.utilisateur.id, fermeId: fermeAId, niveau: 'PROPRIETAIRE' } } }, b.jetonAcces);
  verifier('écriture de relation imbriquée → 400', deplace.statut, 400);

  const bassin = await appel('POST', '/saisie/infrastructures', { nom: 'B1', fermeId: fermeAId, typeInfrastructureId: type['id'], longueur: 10, largeur: 5 }, a.jetonAcces);
  verifier('A crée un bassin chez lui', bassin.statut, 201);
  const vol = await appel('PATCH', `/saisie/infrastructures/${bassin.corps['id']}`, { fermeId: fermeB }, a.jetonAcces);
  verifier('A déplace son bassin chez B → 403', vol.statut, 403);

  // --- Référentiels ---
  verifier('particulier lit un référentiel', (await appel('GET', '/referentiels/especes?_end=1', undefined, a.jetonAcces)).statut, 200);
  verifier('particulier écrit un référentiel → 403', (await appel('POST', '/referentiels/especes', { nom: 'intrus' }, a.jetonAcces)).corps['code'], 'ROLE_INSUFFISANT');

  // --- Administrateur ---
  const admin = await connexion(API, process.env['AQUA_ADMIN_TELEPHONE']!, process.env['AQUA_ADMIN_MOT_DE_PASSE']!);
  verifier('admin lit la ferme de A', (await appel('GET', `/saisie/fermes/${fermeAId}`, undefined, admin.jetonAcces)).statut, 200);

  // --- Rafraîchissement ---
  const r1 = await appel('POST', '/auth/rafraichir', { jetonRafraichissement: a.jetonRafraichissement });
  verifier('rafraîchissement → 200', r1.statut, 200);
  const s1 = r1.corps as unknown as Session;
  verifier('nouveau jeton émis', s1.jetonRafraichissement !== a.jetonRafraichissement, true);
  verifier('même appareil', s1.appareilId, a.appareilId);
  const rejeu = await appel('POST', '/auth/rafraichir', { jetonRafraichissement: a.jetonRafraichissement });
  verifier('rejeu immédiat toléré (réponse perdue)', rejeu.statut, 200);

  await vieillirRemplacement(await familleDe(a.jetonRafraichissement));
  const vol2 = await appel('POST', '/auth/rafraichir', { jetonRafraichissement: a.jetonRafraichissement });
  verifier('rejeu tardif → SESSION_TERMINEE', vol2.corps['code'], 'SESSION_TERMINEE');
  verifier('toute la famille révoquée', (await appel('POST', '/auth/rafraichir', { jetonRafraichissement: s1.jetonRafraichissement })).statut, 401);

  // --- Déconnexion : un appareil, pas les autres ---
  const autre = await connexion(API, telA, 'bassin-A-2026');
  const encore = await connexion(API, telA, 'bassin-A-2026');
  await appel('POST', '/auth/deconnexion', { jetonRafraichissement: autre.jetonRafraichissement });
  verifier('appareil déconnecté', (await appel('POST', '/auth/rafraichir', { jetonRafraichissement: autre.jetonRafraichissement })).statut, 401);
  verifier('autre appareil intact', (await appel('POST', '/auth/rafraichir', { jetonRafraichissement: encore.jetonRafraichissement })).statut, 200);
}

if (!(await fetch(`${API}/sante`).then((r) => r.ok).catch(() => false))) {
  console.error(`API injoignable sur ${API}. Lancez-la avec « pnpm dev:api ».`);
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
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${libelle.padEnd(40)} ${detail}`);
}
const echecs = resultats.filter((r) => !r.ok).length;
console.log(echecs === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${echecs} CONTROLE(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
