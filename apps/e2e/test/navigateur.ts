/// Pilotage d'un Chrome/Edge déjà installé, via le protocole CDP et le
/// `WebSocket` natif de Node. Aucune dépendance : ni Playwright, ni Puppeteer,
/// ni téléchargement de navigateur.

import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EMPLACEMENTS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

export function trouverNavigateur(): string {
  const trouve = EMPLACEMENTS.find((c) => existsSync(c));
  if (!trouve) {
    throw new Error(
      'Aucun navigateur Chromium trouvé. Emplacements essayés :\n  ' +
        EMPLACEMENTS.join('\n  '),
    );
  }
  return trouve;
}

const pause = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

export interface Navigateur {
  aller(url: string): Promise<void>;
  evaluer<T = unknown>(expression: string): Promise<T>;
  attendre(conditionJs: string, libelle: string): Promise<void>;
  /// Mode avion simulé : les requêtes échouent, `navigator.onLine` passe à
  /// faux et l'évènement `offline` part, comme sur un téléphone sans réseau.
  horsLigne(coupe: boolean): Promise<void>;
  /// GPS simulé : la page lit cette position, permission accordée d'office.
  position(latitude: number, longitude: number, precision: number): Promise<void>;
  fermer(): Promise<void>;
}

export async function ouvrirNavigateur(port = 9333): Promise<Navigateur> {
  const binaire = trouverNavigateur();
  // Profil jetable : sans `--user-data-dir` distinct, le binaire rejoint la
  // session déjà ouverte de l'utilisateur au lieu d'en démarrer une à lui.
  const profil = mkdtempSync(path.join(tmpdir(), 'aqua-e2e-'));

  const processus = spawn(
    binaire,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profil}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cible: { webSocketDebuggerUrl: string } | undefined;
  for (let essai = 0; essai < 40 && !cible; essai++) {
    await pause(250);
    try {
      const pages = (await (await fetch(`http://localhost:${port}/json`)).json()) as {
        type: string;
        webSocketDebuggerUrl: string;
      }[];
      cible = pages.find((p) => p.type === 'page');
    } catch {
      // le navigateur n'écoute pas encore
    }
  }
  if (!cible) throw new Error(`Le navigateur n'a pas ouvert le port ${port}.`);

  const ws = new WebSocket(cible.webSocketDebuggerUrl);
  await new Promise((ok, ko) => {
    ws.onopen = () => ok(null);
    ws.onerror = () => ko(new Error('connexion CDP impossible'));
  });

  let compteur = 0;
  const attentes = new Map<number, (m: unknown) => void>();
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data)) as { id?: number };
    if (m.id && attentes.has(m.id)) {
      attentes.get(m.id)!(m);
      attentes.delete(m.id);
    }
  };

  function envoyer(method: string, params: Record<string, unknown> = {}) {
    const id = ++compteur;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise<Record<string, never>>((ok) =>
      attentes.set(id, ok as (m: unknown) => void),
    );
  }

  async function evaluer<T>(expression: string): Promise<T> {
    const reponse = (await envoyer('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })) as unknown as {
      result?: {
        result?: { value?: T };
        exceptionDetails?: { exception?: { description?: string } };
      };
    };
    const souci = reponse.result?.exceptionDetails;
    if (souci) throw new Error(souci.exception?.description ?? 'erreur JS dans la page');
    return reponse.result?.result?.value as T;
  }

  return {
    async aller(url) {
      await envoyer('Page.navigate', { url });
      await pause(1200);
    },
    evaluer,
    async attendre(conditionJs, libelle) {
      for (let essai = 0; essai < 40; essai++) {
        if (await evaluer<boolean>(conditionJs)) return;
        await pause(250);
      }
      throw new Error(`délai dépassé : ${libelle}`);
    },
    async horsLigne(coupe) {
      await envoyer('Network.enable');
      await envoyer('Network.emulateNetworkConditions', {
        offline: coupe,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
    },
    async position(latitude, longitude, precision) {
      const origine = await evaluer<string>('location.origin');
      await envoyer('Browser.grantPermissions', { origin: origine, permissions: ['geolocation'] });
      await envoyer('Emulation.setGeolocationOverride', { latitude, longitude, accuracy: precision });
    },
    async fermer() {
      ws.close();
      // Chrome démarre des processus enfants : tuer le seul parent en laisse.
      if (process.platform === 'win32' && processus.pid) {
        spawn('taskkill', ['/PID', String(processus.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        processus.kill('SIGKILL');
      }
      // Windows garde le profil verrouillé un instant après l'arrêt. Le
      // supprimer est un confort, pas un résultat : ne jamais faire échouer
      // le test là-dessus — le dossier est de toute façon dans le temporaire.
      for (let essai = 0; essai < 5; essai++) {
        await pause(400);
        try {
          rmSync(profil, { recursive: true, force: true });
          return;
        } catch {
          // encore verrouillé
        }
      }
    },
  };
}

/// React ignore une affectation directe de `.value` : il faut passer par le
/// setter natif puis émettre un évènement qui remonte.
export const OUTILS_SAISIE = `
window.__saisir = (id, valeur) => {
  const el = document.getElementById(id);
  if (!el) throw new Error('champ introuvable : ' + id);
  if (el.type === 'checkbox') {
    if (el.checked !== valeur) el.click();
    return true;
  }
  // Case à cocher Radix (shadcn) : un <button role="checkbox">, l'état est dans aria-checked.
  if (el.getAttribute('role') === 'checkbox') {
    if ((el.getAttribute('aria-checked') === 'true') !== valeur) el.click();
    return true;
  }
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
  setter.call(el, String(valeur));
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  return true;
};
window.__ligne = (texte) => {
  const tr = [...document.querySelectorAll('[data-test=ligne]')].find(t => t.innerText.includes(texte));
  return tr ? tr.innerText.replace(/\\s+/g, ' ') : null;
};
true;
`;
