import { ulid } from 'ulid';
import { db, ecrireMeta, lireMeta } from './db';

export const API_URL: string = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000/api';

export interface Utilisateur {
  id: string;
  nom: string;
  prenom: string | null;
  telephone: string | null;
  role: string;
}

interface Session {
  jetonAcces: string;
  jetonRafraichissement: string;
  utilisateur: Utilisateur;
}

/// Refus lisible venu de l'API, ou `HORS_LIGNE` quand le réseau manque.
export class ErreurApi extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statut = 0,
  ) {
    super(message);
  }
}

/// Session en IndexedDB avec les données (D18) : le téléphone reste connecté
/// hors ligne des semaines durant. Le jeton ne sert qu'à synchroniser.
let session: Session | null = null;
let chargee = false;

export async function chargerSession(): Promise<Session | null> {
  if (!chargee) {
    session = (await lireMeta<Session>('session')) ?? null;
    chargee = true;
  }
  return session;
}

async function enregistrer(s: Session | null) {
  session = s;
  if (s) await ecrireMeta('session', s);
  else await db.meta.delete('session');
}

export const utilisateur = () => session?.utilisateur ?? null;

/// Identifiant de l'appareil, engendré ici (D3) : il désigne ce téléphone
/// d'une connexion à l'autre, et `ConflitSync` le note.
export async function appareilId(): Promise<string> {
  let id = await lireMeta<string>('appareilId');
  if (!id) {
    id = ulid();
    await ecrireMeta('appareilId', id);
  }
  return id;
}

async function appareil() {
  return { id: await appareilId(), libelle: navigator.userAgent.slice(0, 100), plateforme: 'pwa' };
}

async function poster(chemin: string, corps: unknown) {
  let reponse: Response;
  try {
    reponse = await fetch(`${API_URL}${chemin}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
  } catch {
    throw new ErreurApi('HORS_LIGNE', 'Pas de réseau. Réessayez une fois connecté.');
  }
  const donnees = (await reponse.json().catch(() => ({}))) as Record<string, unknown>;
  if (!reponse.ok) {
    throw new ErreurApi(
      String(donnees['code'] ?? `HTTP_${reponse.status}`),
      String(donnees['message'] ?? 'Refusé par le serveur.'),
      reponse.status,
    );
  }
  return donnees;
}

export async function connecter(identifiant: string, motDePasse: string) {
  const s = (await poster('/auth/connexion', {
    identifiant,
    motDePasse,
    appareil: await appareil(),
  })) as unknown as Session;
  await enregistrer(s);
  return s.utilisateur;
}

export async function inscrire(d: {
  nom: string;
  prenom?: string;
  telephone: string;
  motDePasse: string;
}) {
  const s = (await poster('/auth/inscription', {
    ...d,
    appareil: await appareil(),
  })) as unknown as Session;
  await enregistrer(s);
  return s.utilisateur;
}

/// Déconnecter efface aussi les données locales : un téléphone prêté ne doit
/// pas garder les fermes du précédent utilisateur. Les saisies non envoyées
/// seraient perdues — l'écran prévient avant.
export async function deconnecter() {
  const s = session;
  await enregistrer(null);
  await Promise.all(db.tables.filter((t) => t.name !== 'meta').map((t) => t.clear()));
  await db.meta.delete('curseur');
  if (s) {
    await poster('/auth/deconnexion', { jetonRafraichissement: s.jetonRafraichissement }).catch(
      () => undefined,
    );
  }
}

/// Un seul rafraîchissement à la fois : deux jetons présentés en parallèle
/// passeraient pour un vol au-delà de la fenêtre de grâce (D18).
let rafraichissement: Promise<string | null> | null = null;

function rafraichir(): Promise<string | null> {
  rafraichissement ??= (async () => {
    if (!session) return null;
    try {
      const s = (await poster('/auth/rafraichir', {
        jetonRafraichissement: session.jetonRafraichissement,
      })) as unknown as Session;
      await enregistrer(s);
      return s.jetonAcces;
    } catch (e) {
      // Hors ligne : on garde la session, on réessaiera. Refus du serveur :
      // la session est finie, il faut se reconnecter.
      if (e instanceof ErreurApi && e.code !== 'HORS_LIGNE') await enregistrer(null);
      throw e;
    }
  })().finally(() => {
    rafraichissement = null;
  });
  return rafraichissement;
}

/// Appel authentifié. Renouvelle le jeton une fois sur un 401.
export async function appelApi<T>(chemin: string, init: RequestInit = {}): Promise<T> {
  const envoyer = async (jeton: string | undefined) => {
    const entetes = new Headers(init.headers);
    if (jeton) entetes.set('Authorization', `Bearer ${jeton}`);
    if (init.body) entetes.set('Content-Type', 'application/json');
    try {
      return await fetch(`${API_URL}${chemin}`, { ...init, headers: entetes });
    } catch {
      throw new ErreurApi('HORS_LIGNE', 'Pas de réseau.');
    }
  };
  let reponse = await envoyer(session?.jetonAcces);
  if (reponse.status === 401 && session) {
    const jeton = await rafraichir();
    if (jeton) reponse = await envoyer(jeton);
  }
  const donnees = (await reponse.json().catch(() => ({}))) as Record<string, unknown>;
  if (!reponse.ok) {
    throw new ErreurApi(
      String(donnees['code'] ?? `HTTP_${reponse.status}`),
      String(donnees['message'] ?? 'Refusé par le serveur.'),
      reponse.status,
    );
  }
  return donnees as T;
}
