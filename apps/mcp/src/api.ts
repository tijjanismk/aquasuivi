/// Accès à l'API Aqua-Suivi, **en lecture seule**.
///
/// Passer par l'API plutôt que par la base n'est pas un détour : c'est elle
/// qui convertit les `Decimal` en nombres et les dates de terrain en
/// « AAAA-MM-JJ ». Interroger PostgreSQL directement obligerait à réécrire ces
/// conversions, donc à les faire diverger tôt ou tard.

import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const API_URL = process.env['AQUA_API_URL'] ?? 'http://localhost:3000/api';

/// L'API est fermée par défaut (D18). Identifiants lus dans l'environnement,
/// à défaut dans le `.env` du monorepo : `.mcp.json` est versionné et ne doit
/// porter aucun mot de passe.
function identifiants() {
  try {
    process.loadEnvFile(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env'),
    );
  } catch {
    // Pas de .env : l'environnement du client MCP doit suffire.
  }
  const identifiant = process.env['AQUA_IDENTIFIANT'] ?? process.env['AQUA_ADMIN_TELEPHONE'];
  const motDePasse = process.env['AQUA_MOT_DE_PASSE'] ?? process.env['AQUA_ADMIN_MOT_DE_PASSE'];
  if (!identifiant || !motDePasse) {
    throw new Error(
      'Identifiants absents : renseignez AQUA_IDENTIFIANT et AQUA_MOT_DE_PASSE ' +
        '(ou AQUA_ADMIN_TELEPHONE / AQUA_ADMIN_MOT_DE_PASSE dans le .env).',
    );
  }
  return { identifiant, motDePasse };
}

let jetonAcces: string | undefined;

async function joindre(url: URL | string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (cause) {
    throw new Error(
      `API Aqua-Suivi injoignable sur ${API_URL}. Démarrez-la avec « pnpm dev:api ». ` +
        `(${(cause as Error).message})`,
    );
  }
}

/// Seul POST du module, et il ne vise que la connexion : il n'écrit rien
/// dans les données de terrain.
async function seConnecter(): Promise<string> {
  const reponse = await joindre(`${API_URL}/auth/connexion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(identifiants()),
  });
  if (!reponse.ok) {
    throw new Error(`Connexion à l'API refusée (${reponse.status}) : vérifiez les identifiants.`);
  }
  jetonAcces = ((await reponse.json()) as { jetonAcces: string }).jetonAcces;
  return jetonAcces;
}

/// Seul `GET` est possible depuis ce module : la restriction est structurelle,
/// pas une consigne qu'on pourrait oublier.
async function lire<T>(chemin: string, parametres?: Record<string, string | undefined>): Promise<T> {
  const url = new URL(`${API_URL}${chemin}`);
  for (const [cle, valeur] of Object.entries(parametres ?? {})) {
    if (valeur !== undefined && valeur !== '') url.searchParams.set(cle, valeur);
  }

  const envoyer = (jeton: string) =>
    joindre(url, { method: 'GET', headers: { Authorization: `Bearer ${jeton}` } });

  let reponse = await envoyer(jetonAcces ?? (await seConnecter()));
  // Jeton de 15 minutes : un serveur MCP vit bien plus longtemps. On se
  // reconnecte plutôt que de gérer un jeton de rafraîchissement de plus.
  if (reponse.status === 401) reponse = await envoyer(await seConnecter());

  const texte = await reponse.text();
  if (!reponse.ok) {
    const detail = (() => {
      try {
        return (JSON.parse(texte) as { message?: string }).message ?? texte;
      } catch {
        return texte;
      }
    })();
    throw new Error(`${reponse.status} sur ${chemin} : ${detail}`);
  }
  return texte ? (JSON.parse(texte) as T) : (undefined as T);
}

export interface Ferme {
  id: string;
  nom: string;
  promoteur: string | null;
  village: string | null;
  actif: boolean;
  region?: { nom: string } | null;
  commune?: { nom: string } | null;
}

export interface Infrastructure {
  id: string;
  nom: string;
  fermeId: string;
  superficie: number | null;
  volume: number | null;
  actif: boolean;
  typeInfrastructure?: { nom: string; forme: string; mesureBase: string };
  ferme?: { nom: string };
}

export interface Cycle {
  id: string;
  numero: number;
  infrastructureId: string;
  dateMiseEnCharge: string;
  dateCloture: string | null;
  statut: string;
  observation: string | null;
  infrastructure?: { nom: string; fermeId: string };
  espece?: { nom: string } | null;
}

const PAGE = { _start: '0', _end: '200' };

export const api = {
  config: () => lire<Record<string, unknown>>('/config'),

  fermes: (filtres: { actif?: string } = {}) =>
    lire<Ferme[]>('/saisie/fermes', { ...PAGE, _sort: 'nom', ...filtres }),

  infrastructures: (filtres: { fermeId?: string } = {}) =>
    lire<Infrastructure[]>('/saisie/infrastructures', { ...PAGE, _sort: 'nom', ...filtres }),

  cycles: (filtres: { infrastructureId?: string; statut?: string } = {}) =>
    lire<Cycle[]>('/saisie/cycles', {
      ...PAGE,
      _sort: 'dateMiseEnCharge',
      _order: 'desc',
      ...filtres,
    }),

  cycle: (id: string) => lire<Cycle>(`/saisie/cycles/${id}`),

  indicateurs: (cycleId: string) =>
    lire<Record<string, unknown>>(`/cycles/${cycleId}/indicateurs`),

  referentiel: (segment: string, recherche?: string) =>
    lire<Record<string, unknown>[]>(`/referentiels/${segment}`, {
      ...PAGE,
      ...(recherche ? { q: recherche } : {}),
    }),

  regions: () => lire<{ id: string; nom: string }[]>('/geographie/regions'),
};
