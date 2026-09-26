/// Vérifie le serveur MCP en le parlant vraiment : on lance le processus, on
/// échange en JSON-RPC sur son entrée/sortie standard, et on appelle ses outils.
///
/// Un serveur MCP qui compile ne prouve rien — ce qui casse, c'est la forme
/// des messages et le schéma des outils.
///
/// Prérequis : `pnpm dev:api`. Le test crée une ferme puis la supprime.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Pool } from 'pg';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { authentifierEnAdmin } from './session.js';

process.loadEnvFile(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env'),
);

const API = process.env['E2E_API_URL'] ?? 'http://localhost:3000/api';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../mcp');
const SERVEUR = path.join(RACINE, 'dist', 'serveur.js');
const FERME_TEST = 'Ferme parcours MCP';

const resultats: { libelle: string; ok: boolean; detail: string }[] = [];
function verifier(libelle: string, ok: boolean, detail: unknown = '') {
  // Les détails contiennent du JSON : sur plusieurs lignes, le tableau final
  // devient illisible.
  resultats.push({
    libelle,
    ok,
    detail: String(detail ?? '').replace(/\s+/g, ' ').slice(0, 90),
  });
}

interface Reponse {
  id?: number;
  result?: { tools?: { name: string }[]; content?: { text?: string }[]; isError?: boolean };
  error?: { message?: string };
}

/// Client JSON-RPC minimal sur stdio — la transport MCP la plus courante.
function ouvrirServeur() {
  // On lance le **livrable compilé**, avec le Node courant : c'est ce que les
  // clients MCP exécuteront. Passer par `npx tsx` testerait autre chose, et
  // Node 24 refuse de toute façon de lancer un `.cmd` sans shell.
  const processus = spawn(process.execPath, [SERVEUR], {
    cwd: RACINE,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, AQUA_API_URL: API },
  });

  let tampon = '';
  const attentes = new Map<number, (r: Reponse) => void>();
  processus.stdout.setEncoding('utf8');
  processus.stdout.on('data', (morceau: string) => {
    tampon += morceau;
    let coupure: number;
    while ((coupure = tampon.indexOf('\n')) >= 0) {
      const ligne = tampon.slice(0, coupure).trim();
      tampon = tampon.slice(coupure + 1);
      if (!ligne) continue;
      try {
        const message = JSON.parse(ligne) as Reponse;
        if (message.id && attentes.has(message.id)) {
          attentes.get(message.id)!(message);
          attentes.delete(message.id);
        }
      } catch {
        // ligne non JSON : trace du serveur, sans intérêt ici
      }
    }
  });

  let erreurs = '';
  processus.stderr.setEncoding('utf8');
  processus.stderr.on('data', (m: string) => (erreurs += m));

  let compteur = 0;
  function envoyer(method: string, params: unknown): Promise<Reponse> {
    const id = ++compteur;
    processus.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return new Promise((ok, ko) => {
      attentes.set(id, ok);
      setTimeout(
        () => ko(new Error(`pas de réponse à « ${method} ». stderr: ${erreurs.slice(0, 300)}`)),
        20000,
      );
    });
  }

  return {
    envoyer,
    notifier: (method: string) =>
      processus.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`),
    fermer: () => processus.kill(),
    erreurs: () => erreurs,
  };
}

function contenu(reponse: Reponse): string {
  return reponse.result?.content?.[0]?.text ?? '';
}

async function nettoyer() {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  try {
    await pool.query('DELETE FROM "Ferme" WHERE nom = $1', [FERME_TEST]);
  } finally {
    await pool.end();
  }
}

if (!(await fetch(`${API}/sante`).then((r) => r.ok).catch(() => false))) {
  console.error(`API injoignable sur ${API}. Lancez-la avec « pnpm dev:api ».`);
  process.exit(1);
}
if (!existsSync(SERVEUR)) {
  console.error(`Serveur MCP non compilé. Lancez « pnpm --filter @aqua/mcp build ».`);
  process.exit(1);
}
// Le parcours crée sa ferme par l'API ; le serveur MCP, lui, se connecte seul.
await authentifierEnAdmin(API);

await nettoyer();
const serveur = ouvrirServeur();

try {
  const init = await serveur.envoyer('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'aqua-e2e', version: '0.1.0' },
  });
  verifier('poignée de main MCP', init.error === undefined, init.error?.message ?? 'ok');
  serveur.notifier('notifications/initialized');

  const outils = await serveur.envoyer('tools/list', {});
  const noms = (outils.result?.tools ?? []).map((o) => o.name).sort();
  const attendus = [
    'alertes_en_cours',
    'configuration',
    'consulter_referentiel',
    'indicateurs_cycle',
    'lister_cycles',
    'lister_fermes',
    'lister_infrastructures',
    'resume_ferme',
  ];
  verifier(
    'les 8 outils sont déclarés',
    JSON.stringify(noms) === JSON.stringify(attendus),
    noms.join(', '),
  );

  // Aucun outil ne doit pouvoir écrire : c'est la garantie principale de ce
  // serveur, et elle doit être vérifiée, pas seulement annoncée.
  const suspects = noms.filter((n) => /creer|modifier|supprimer|ecrire|maj/i.test(n));
  verifier('aucun outil d’écriture', suspects.length === 0, suspects.join(', ') || 'aucun');

  const config = await serveur.envoyer('tools/call', {
    name: 'configuration',
    arguments: {},
  });
  verifier('outil configuration', contenu(config).includes('XOF'), contenu(config).slice(0, 60));

  const especes = await serveur.envoyer('tools/call', {
    name: 'consulter_referentiel',
    arguments: { referentiel: 'especes', recherche: 'Tilapia' },
  });
  verifier(
    'référentiel des espèces',
    contenu(especes).includes('Tilapia du Nil'),
    contenu(especes).slice(0, 60),
  );

  // Une ferme réelle, pour que `resume_ferme` ait quelque chose à résumer.
  const ferme = (await (
    await fetch(`${API}/saisie/fermes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: FERME_TEST, promoteur: 'Parcours automatisé' }),
    })
  ).json()) as { id: string };

  const fermes = await serveur.envoyer('tools/call', {
    name: 'lister_fermes',
    arguments: {},
  });
  verifier('outil lister_fermes', contenu(fermes).includes(FERME_TEST), 'ferme retrouvée');

  const resume = await serveur.envoyer('tools/call', {
    name: 'resume_ferme',
    arguments: { fermeId: ferme.id },
  });
  const resumeTexte = contenu(resume);
  verifier(
    'outil resume_ferme',
    resumeTexte.includes(FERME_TEST) && resumeTexte.includes('infrastructures'),
    resumeTexte.slice(0, 70).replace(/\s+/g, ' '),
  );

  // Une erreur doit revenir lisible, pas en pile d'appels.
  const absent = await serveur.envoyer('tools/call', {
    name: 'indicateurs_cycle',
    arguments: { cycleId: '01ZZZZZZZZZZZZZZZZZZZZZZZZ' },
  });
  verifier(
    'erreur lisible sur cycle inexistant',
    absent.result?.isError === true && contenu(absent).toLowerCase().includes('introuvable'),
    contenu(absent).slice(0, 70),
  );
} catch (e) {
  verifier('parcours interrompu', false, (e as Error).message);
} finally {
  serveur.fermer();
  await nettoyer();
}

for (const { libelle, ok, detail } of resultats) {
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${libelle.padEnd(34)} ${detail}`);
}
const echecs = resultats.filter((r) => !r.ok).length;
console.log(echecs === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${echecs} CONTROLE(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
