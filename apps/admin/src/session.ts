import type { AuthProvider } from '@refinedev/core';
import { axiosInstance } from '@refinedev/simple-rest';
import { API_URL } from './config';

/// Session de l'admin (D18) : jeton d'accès de 15 minutes, rafraîchi en
/// silence. Gardée en `localStorage` pour survivre à un rechargement ; la
/// PWA de terrain, elle, la gardera en IndexedDB avec ses données.

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

const CLE = 'aqua.session';

function lire(): Session | null {
  try {
    const brut = localStorage.getItem(CLE);
    return brut ? (JSON.parse(brut) as Session) : null;
  } catch {
    return null;
  }
}

function ecrire(session: Session | null) {
  try {
    if (session) localStorage.setItem(CLE, JSON.stringify(session));
    else localStorage.removeItem(CLE);
  } catch {
    // Stockage refusé (navigation privée) : la session vivra le temps de l'onglet.
  }
  enMemoire = session;
}

let enMemoire: Session | null = lire();

export const utilisateurCourant = () => enMemoire?.utilisateur ?? null;

async function poster(chemin: string, corps: unknown) {
  const reponse = await fetch(`${API_URL}${chemin}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });
  const donnees = (await reponse.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: reponse.ok, donnees };
}

/// Un seul rafraîchissement en vol : dix requêtes qui reçoivent un 401 en
/// même temps ne doivent pas présenter dix fois le même jeton — au-delà de
/// la fenêtre de grâce, le serveur y verrait un vol et fermerait la session.
let rafraichissementEnCours: Promise<string | null> | null = null;

function rafraichir(): Promise<string | null> {
  rafraichissementEnCours ??= (async () => {
    const session = enMemoire;
    if (!session) return null;
    const { ok, donnees } = await poster('/auth/rafraichir', {
      jetonRafraichissement: session.jetonRafraichissement,
    });
    if (!ok) {
      ecrire(null);
      return null;
    }
    ecrire(donnees as unknown as Session);
    return (donnees as unknown as Session).jetonAcces;
  })().finally(() => {
    rafraichissementEnCours = null;
  });
  return rafraichissementEnCours;
}

/// `fetch` authentifié, pour les écrans qui n'appellent pas l'API par Refine.
export async function appelApi(chemin: string, init: RequestInit = {}): Promise<Response> {
  const envoyer = (jeton: string | undefined) => {
    const entetes = new Headers(init.headers);
    if (jeton) entetes.set('Authorization', `Bearer ${jeton}`);
    return fetch(`${API_URL}${chemin}`, { ...init, headers: entetes });
  };
  const reponse = await envoyer(enMemoire?.jetonAcces);
  if (reponse.status !== 401 || !enMemoire) return reponse;
  const jeton = await rafraichir();
  return jeton ? envoyer(jeton) : reponse;
}

axiosInstance.interceptors.request.use((config) => {
  if (enMemoire) config.headers.set('Authorization', `Bearer ${enMemoire.jetonAcces}`);
  return config;
});

/// Enregistré après l'intercepteur de simple-rest : l'erreur reçue ici en a
/// déjà `statusCode` et `config`.
axiosInstance.interceptors.response.use(undefined, async (erreur) => {
  const e = erreur as { statusCode?: number; config?: { _rejoue?: boolean } };
  if (e.statusCode !== 401 || !e.config || e.config._rejoue || !enMemoire) throw erreur;
  const jeton = await rafraichir();
  if (!jeton) throw erreur;
  return axiosInstance({ ...e.config, _rejoue: true } as never);
});

export const authProvider: AuthProvider = {
  login: async ({ identifiant, motDePasse }: { identifiant: string; motDePasse: string }) => {
    const { ok, donnees } = await poster('/auth/connexion', {
      identifiant,
      motDePasse,
      appareil: { libelle: 'Administration', plateforme: 'web' },
    });
    if (!ok) {
      return {
        success: false,
        error: {
          name: String(donnees['code'] ?? 'CONNEXION'),
          message: String(donnees['message'] ?? 'Connexion impossible.'),
        },
      };
    }
    ecrire(donnees as unknown as Session);
    return { success: true, redirectTo: '/' };
  },

  logout: async () => {
    const session = enMemoire;
    ecrire(null);
    // Révoque cet appareil côté serveur ; sans réseau, le jeton expirera seul.
    if (session) {
      await poster('/auth/deconnexion', {
        jetonRafraichissement: session.jetonRafraichissement,
      }).catch(() => undefined);
    }
    return { success: true, redirectTo: '/connexion' };
  },

  check: async () =>
    enMemoire ? { authenticated: true } : { authenticated: false, redirectTo: '/connexion' },

  onError: async (erreur: { statusCode?: number }) =>
    erreur?.statusCode === 401 && !enMemoire ? { logout: true, redirectTo: '/connexion' } : {},

  getIdentity: async () => utilisateurCourant(),
};
