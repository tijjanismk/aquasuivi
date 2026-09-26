/// Synchronisation (étape 5, D8) : deux téléphones hors ligne, un seul bassin.
///
/// A, pisciculteur, saisit sa ferme hors ligne puis pousse. E, encadreur, se
/// voit confier la ferme après son premier pull : il doit quand même tout
/// recevoir. Les deux modifient la même pesée sans réseau → une seule version
/// gagne, et `ConflitSync` en garde exactement une trace.
///
/// Prérequis : `pnpm dev:api` et `pnpm db:seed`.

import { Pool } from 'pg';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

process.loadEnvFile(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env'),
);

const API = process.env['E2E_API_URL'] ?? 'http://localhost:3000/api';
const NOM_TEST = 'Parcours sync';

const resultats: { libelle: string; ok: boolean; detail: string }[] = [];
function verifier(libelle: string, obtenu: unknown, attendu: unknown) {
  resultats.push({ libelle, ok: obtenu === attendu, detail: `obtenu=${String(obtenu)}  attendu=${String(attendu)}` });
}

type Corps = Record<string, any>;

async function appel(methode: string, chemin: string, jeton: string, corps?: unknown) {
  const reponse = await fetch(`${API}${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${jeton}`,
      ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });
  const texte = await reponse.text();
  return { statut: reponse.status, corps: (texte ? JSON.parse(texte) : {}) as Corps };
}

/// ULID suffisant pour un test : horodatage puis aléa, alphabet de Crockford.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function ulid() {
  let t = Date.now();
  let tete = '';
  for (let i = 0; i < 10; i++) {
    tete = CROCKFORD[t % 32] + tete;
    t = Math.floor(t / 32);
  }
  let queue = '';
  for (let i = 0; i < 16; i++) queue += CROCKFORD[Math.floor(Math.random() * 32)];
  return tete + queue;
}

/// « Modifié après » : l'API borne l'heure du client à la sienne, donc 2 s
/// d'avance donnent un résultat déterministe malgré les quelques
/// millisecondes d'écart entre l'horloge de ce processus et celle de l'API.
const plusTard = () => new Date(Date.now() + 2000).toISOString();

const numero = () => `+2238${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;

interface Telephone {
  jeton: string;
  appareilId: string;
  userId: string;
}

async function inscrire(libelle: string): Promise<Telephone> {
  const r = await fetch(`${API}/auth/inscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom: NOM_TEST, telephone: numero(), motDePasse: 'bassin-sync-2026', appareil: { id: ulid(), libelle, plateforme: 'pwa' } }),
  });
  const s = (await r.json()) as Corps;
  return { jeton: s['jetonAcces'], appareilId: s['appareilId'], userId: s['utilisateur']['id'] };
}

const pousser = (t: Telephone, changements: unknown[]) =>
  appel('POST', '/sync/push', t.jeton, { appareilId: t.appareilId, changements }).then((r) => r.corps['resultats'] as Corps[]);

const tirer = (t: Telephone, depuis?: string) =>
  appel('GET', `/sync/pull?appareilId=${t.appareilId}${depuis ? `&depuis=${encodeURIComponent(depuis)}` : ''}`, t.jeton).then((r) => r.corps);

const ligne = (pull: Corps, ressource: string, id: string) =>
  (pull['saisie'][ressource]['modifies'] as Corps[]).find((l) => l['id'] === id);

async function sql(requete: string, parametres: unknown[] = []) {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  try {
    return (await pool.query(requete, parametres)).rows;
  } finally {
    await pool.end();
  }
}

async function nettoyer() {
  await sql(`DELETE FROM "ConflitSync" WHERE "userId" IN (SELECT id FROM "User" WHERE nom = $1)`, [NOM_TEST]);
  await sql(
    `DELETE FROM "Ferme" WHERE id IN (
       SELECT a."fermeId" FROM "AccesFerme" a JOIN "User" u ON u.id = a."userId" WHERE u.nom = $1)`,
    [NOM_TEST],
  );
  await sql('DELETE FROM "User" WHERE nom = $1', [NOM_TEST]);
}

const conflitsSur = async (id: string) =>
  sql('SELECT raison, "valeurRejetee", "valeurRetenue", "appareilId" FROM "ConflitSync" WHERE enregistrement = $1 ORDER BY "createdAt"', [id]);

async function parcours() {
  const a = await inscrire('Téléphone du pisciculteur');
  const e = await inscrire('Téléphone de l’encadreur');
  const b = await inscrire('Téléphone d’un voisin');

  // --- Premier pull de E : rien encore ---
  const e0 = await tirer(e);
  verifier('premier pull : curseur rendu', typeof e0['curseur'], 'string');
  verifier('premier pull : référentiels inclus', (e0['referentiels']['especes'] as unknown[]).length > 0, true);
  verifier('premier pull : aucune ferme', e0['saisie']['fermes']['modifies'].length, 0);

  // --- A saisit tout hors ligne, puis pousse ---
  const tilapia = (e0['referentiels']['especes'] as Corps[]).find((x) => x['codeFao'] === 'TLN')!['id'];
  const type = (e0['referentiels']['types-infrastructure'] as Corps[])[0]!['id'];
  const [F, I, C, L, P, M] = [ulid(), ulid(), ulid(), ulid(), ulid(), ulid()];
  const saisieHorsLigne = [
    { ressource: 'fermes', id: F, operation: 'ecrire', donnees: { nom: `${NOM_TEST} ferme` } },
    { ressource: 'infrastructures', id: I, operation: 'ecrire', donnees: { nom: 'S1', fermeId: F, typeInfrastructureId: type, longueur: 20, largeur: 10 } },
    { ressource: 'cycles', id: C, operation: 'ecrire', donnees: { infrastructureId: I, dateMiseEnCharge: '2026-01-10', especeId: tilapia } },
    { ressource: 'lots', id: L, operation: 'ecrire', donnees: { cycleId: C, especeId: tilapia, nombre: 500, poidsMoyenG: 8, dateMiseEnCharge: '2026-01-10' } },
    { ressource: 'pesees', id: P, operation: 'ecrire', donnees: { cycleId: C, dateOperation: '2026-02-10', tauxRationPct: 2 } },
    { ressource: 'mortalites', id: M, operation: 'ecrire', donnees: { lotId: L, dateConstat: '2026-01-20', nombre: 12 } },
  ];
  const r1 = await pousser(a, saisieHorsLigne);
  verifier('push initial : 6 lignes appliquées', r1.filter((r) => r['statut'] === 'applique').length, 6);
  const rejeu = await pousser(a, saisieHorsLigne);
  verifier('push rejoué (réponse perdue) : sans conflit', rejeu.every((r) => r['statut'] === 'applique'), true);
  verifier('push rejoué : rien journalisé', (await sql('SELECT count(*)::int n FROM "ConflitSync" WHERE "userId" = $1', [a.userId]))[0].n, 0);

  // --- Accès confié à E après son premier pull ---
  await sql(
    `INSERT INTO "AccesFerme" (id, "userId", "fermeId", niveau, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'ENCADREUR', now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC')`,
    [ulid(), e.userId, F],
  );
  const e1 = await tirer(e, e0['curseur']);
  verifier('ferme confiée : reçue malgré un curseur plus récent', !!ligne(e1, 'fermes', F), true);
  verifier('ferme confiée : sa pesée aussi', !!ligne(e1, 'pesees', P), true);
  verifier('le voisin ne reçoit rien', (await tirer(b))['saisie']['pesees']['modifies'].length, 0);
  verifier('le voisin ne peut pas écrire', (await pousser(b, [{ ressource: 'pesees', id: P, operation: 'ecrire', donnees: { tauxRationPct: 9 } }]))[0]!['code'], 'LIGNE_INTROUVABLE');

  // --- Même pesée modifiée sur les deux téléphones hors ligne ---
  const a1 = await tirer(a);
  const versionA = ligne(a1, 'pesees', P)!['updatedAt'];
  const versionE = ligne(e1, 'pesees', P)!['updatedAt'];
  verifier('les deux partent de la même version', versionA, versionE);

  const heureA = new Date().toISOString();
  const ra = await pousser(a, [{ ressource: 'pesees', id: P, operation: 'ecrire', donnees: { tauxRationPct: 3 }, versionBase: versionA, modifieLe: heureA }]);
  verifier('A pousse en premier : appliqué', ra[0]!['statut'], 'applique');

  const re = await pousser(e, [{ ressource: 'pesees', id: P, operation: 'ecrire', donnees: { tauxRationPct: 4 }, versionBase: versionE, modifieLe: plusTard() }]);
  verifier('E pousse ensuite : conflit détecté', re[0]!['statut'], 'conflit');
  verifier('E a modifié en dernier : il gagne', re[0]!['gagnant'], 'client');
  const apres = await tirer(a, a1['curseur']);
  verifier('valeur retenue en base', ligne(apres, 'pesees', P)?.['tauxRationPct'], 4);
  const trace = await conflitsSur(P);
  verifier('ConflitSync : exactement une ligne', trace.length, 1);
  verifier('ConflitSync : la valeur de A est gardée', trace[0]?.valeurRejetee?.tauxRationPct, 3);
  verifier('ConflitSync : appareil noté', trace[0]?.appareilId, e.appareilId);

  // --- Modification ancienne arrivée tard : le serveur garde la plus récente ---
  const tard = await pousser(a, [{ ressource: 'pesees', id: P, operation: 'ecrire', donnees: { tauxRationPct: 1 }, versionBase: versionA, modifieLe: heureA.replace(/T.*/, 'T00:00:00.000Z') }]);
  verifier('modification plus ancienne : le serveur gagne', tard[0]!['gagnant'], 'serveur');
  verifier('valeur inchangée', ligne(await tirer(a), 'pesees', P)?.['tauxRationPct'], 4);
  verifier('ConflitSync : une trace de plus', (await conflitsSur(P)).length, 2);
  verifier('horloge du téléphone dans le futur bornée', (await pousser(a, [{ ressource: 'pesees', id: P, operation: 'ecrire', donnees: { tauxRationPct: 6 }, versionBase: versionA, modifieLe: '2099-01-01T00:00:00.000Z' }]))[0]!['gagnant'], 'client');

  // --- Suppression contre modification ---
  const vM = ligne(await tirer(e), 'mortalites', M)!['updatedAt'];
  const avantModif = new Date(Date.now() - 1000).toISOString();
  await pousser(a, [{ ressource: 'mortalites', id: M, operation: 'ecrire', donnees: { nombre: 5 }, versionBase: vM }]);
  const sup = await pousser(e, [{ ressource: 'mortalites', id: M, operation: 'supprimer', versionBase: vM, modifieLe: avantModif }]);
  verifier('suppression plus ancienne qu’une modification : refusée', sup[0]!['gagnant'], 'serveur');
  // Le pull relit la dernière minute (recouvrement) : pour voir qu'il est
  // incrémental, la ferme et l'accès de E doivent être plus anciens que ça.
  await sql(`UPDATE "Ferme" SET "updatedAt" = "updatedAt" - interval '10 minutes' WHERE id = $1`, [F]);
  await sql(`UPDATE "AccesFerme" SET "createdAt" = "createdAt" - interval '10 minutes' WHERE "fermeId" = $1`, [F]);
  const curseur = (await tirer(e))['curseur'];
  const sup2 = await pousser(e, [{ ressource: 'mortalites', id: M, operation: 'supprimer', versionBase: vM, modifieLe: plusTard() }]);
  verifier('suppression plus récente : appliquée', sup2[0]!['statut'], 'applique');
  const delta = await tirer(e, curseur);
  verifier('le pull transmet la suppression', (delta['saisie']['mortalites']['supprimes'] as string[]).includes(M), true);
  verifier('le pull est incrémental (ferme inchangée absente)', !!ligne(delta, 'fermes', F), false);
  verifier('écrire sur une ligne supprimée', (await pousser(a, [{ ressource: 'mortalites', id: M, operation: 'ecrire', donnees: { nombre: 7 }, versionBase: vM }]))[0]!['code'], 'LIGNE_SUPPRIMEE');

  // --- Erreur métier identifiable, sans bloquer le reste du lot ---
  const C2 = ulid();
  const D = ulid();
  const lot = await pousser(e, [
    { ressource: 'cycles', id: C2, operation: 'ecrire', donnees: { infrastructureId: I, dateMiseEnCharge: '2026-03-01' } },
    { ressource: 'depenses', id: D, operation: 'ecrire', donnees: { cycleId: C, montant: 8000, dateOperation: '2026-02-01', updatedAt: '2000-01-01T00:00:00.000Z' } },
  ]);
  verifier('second cycle ouvert : CYCLE_DEJA_OUVERT', lot[0]!['code'], 'CYCLE_DEJA_OUVERT');
  verifier('la suite du lot est appliquée', lot[1]!['statut'], 'applique');
  verifier('updatedAt fourni par le client ignoré', String(lot[1]!['version']).startsWith('2000'), false);
  verifier('contrôle de saisie renvoyé par ligne', (await pousser(a, [{ ressource: 'pesees', id: ulid(), operation: 'ecrire', donnees: { cycleId: C, dateOperation: '2025-01-01' } }]))[0]!['code'], 'DATE_AVANT_MISE_EN_CHARGE');

  // --- Divers ---
  verifier('curseur illisible → 400', (await appel('GET', '/sync/pull?depuis=hier', a.jeton)).corps['code'], 'CURSEUR_INVALIDE');
  const [appareil] = await sql('SELECT "derniereSyncAt" FROM "Appareil" WHERE id = $1', [a.appareilId]);
  verifier('dernière synchronisation notée sur l’appareil', appareil?.derniereSyncAt !== null, true);
}

if (!(await fetch(`${API}/sante`).then((r) => r.ok).catch(() => false))) {
  console.error(`API injoignable sur ${API}. Lancez-la avec « pnpm dev:api ».`);
  process.exit(1);
}

await nettoyer();
try {
  await parcours();
} catch (err) {
  resultats.push({ libelle: 'parcours interrompu', ok: false, detail: (err as Error).stack ?? String(err) });
} finally {
  await nettoyer();
}

for (const { libelle, ok, detail } of resultats) {
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${libelle.padEnd(52)} ${detail}`);
}
const echecs = resultats.filter((r) => !r.ok).length;
console.log(echecs === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${echecs} CONTROLE(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
