/// Parcours de bout en bout : navigateur réel → admin → API → PostgreSQL.
///
/// Il couvre ce que ni le typecheck ni le build ne voient. Les deux premiers
/// bugs de l'admin — tri par défaut impossible sur les paliers, champ vide
/// envoyé à `null` à la création — ne se manifestaient qu'ici.
///
/// Prérequis : `pnpm dev:api` et `pnpm dev:admin` doivent tourner.
///
/// Limite assumée : le test écrit dans la base de développement et nettoie
/// derrière lui. Une base de test dédiée serait plus propre.

import { Pool } from 'pg';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ouvrirNavigateur, OUTILS_SAISIE, type Navigateur } from './navigateur.ts';
import { authentifierEnAdmin, connecterNavigateur } from './session.js';

process.loadEnvFile(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env'),
);

const ADMIN = process.env['E2E_ADMIN_URL'] ?? 'http://localhost:5173';
const API = process.env['E2E_API_URL'] ?? 'http://localhost:3000/api';

/// Nom volontairement improbable : le nettoyage final le cible par égalité.
const ALIMENT_TEST = 'Aliment parcours automatisé';

const resultats: { libelle: string; ok: boolean; detail: string }[] = [];
function verifier(libelle: string, ok: boolean, detail: unknown = '') {
  resultats.push({ libelle, ok, detail: String(detail ?? '') });
}

async function joignable(url: string) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function preconditions() {
  const manquants: string[] = [];
  if (!(await joignable(`${API}/sante`))) manquants.push(`API sur ${API} (pnpm dev:api)`);
  if (!(await joignable(ADMIN))) manquants.push(`admin sur ${ADMIN} (pnpm dev:admin)`);
  if (manquants.length > 0) {
    console.error('Impossible de lancer le parcours, il manque :');
    for (const m of manquants) console.error(`  - ${m}`);
    process.exit(1);
  }
}

async function parcours(nav: Navigateur) {
  // --- Création depuis le formulaire ---
  await nav.aller(`${ADMIN}/referentiels/aliments/nouveau`);
  await nav.attendre(`!!document.getElementById('nom')`, 'formulaire de création');
  await nav.evaluer(OUTILS_SAISIE);
  await nav.evaluer(`__saisir('nom', ${JSON.stringify(ALIMENT_TEST)})`);
  await nav.evaluer(`__saisir('tauxProteine', 31.5)`);
  await nav.evaluer(`__saisir('prixKg', 555)`);
  await nav.evaluer(`__saisir('local', true)`);
  await nav.evaluer(`document.querySelector('[data-test=enregistrer]').click()`);

  await nav.attendre(
    `location.pathname === '/referentiels/aliments'`,
    'retour à la liste après création',
  );
  await nav.attendre(
    `document.body.innerText.includes(${JSON.stringify(ALIMENT_TEST)})`,
    'ligne créée visible',
  );
  await nav.evaluer(OUTILS_SAISIE);
  const ligne = await nav.evaluer<string | null>(`__ligne(${JSON.stringify(ALIMENT_TEST)})`);
  verifier('création depuis le formulaire', ligne !== null, ligne);

  // Le montant s'affiche via la devise active : aucun écran ne doit écrire
  // « F CFA » lui-même, sinon l'ajout d'une seconde devise devient une chasse.
  verifier('montant formaté avec la devise', (ligne ?? '').includes('F CFA'), ligne);

  // Le contrôle ci-dessus ne dirait rien du type : une chaîne « 31.5 » se
  // formaterait pareil. On vérifie donc le JSON brut, car un `Decimal` non
  // converti se concaténerait silencieusement dans les calculs.
  const brut = (await (
    await fetch(`${API}/referentiels/aliments?_end=200&q=parcours automatisé`)
  ).json()) as { nom: string; tauxProteine: unknown }[];
  const typeRecu = typeof brut.find((a) => a.nom === ALIMENT_TEST)?.tauxProteine;
  verifier('décimal transmis comme nombre, pas comme chaîne', typeRecu === 'number', typeRecu);

  // --- Recherche ---
  await nav.evaluer(`
    (() => {
      const el = document.querySelector('[data-test=recherche]');
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
      setter.call(el, 'parcours automatisé');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()
  `);
  await nav.attendre(
    `document.querySelectorAll('[data-test=ligne]').length === 1`,
    'recherche filtrant à une ligne',
  );
  verifier('recherche texte', true, '1 ligne');

  // --- Modification ---
  await nav.evaluer(`
    document.querySelector('[data-test=lien-modifier]').click()
  `);
  await nav.attendre(`!!document.getElementById('prixKg')`, 'formulaire de modification');
  const prixCharge = await nav.evaluer<string>(`document.getElementById('prixKg').value`);
  verifier('valeurs pré-remplies à la modification', prixCharge === '555', `prixKg=${prixCharge}`);

  await nav.evaluer(OUTILS_SAISIE);
  await nav.evaluer(`__saisir('prixKg', 610)`);
  await nav.evaluer(`document.querySelector('[data-test=enregistrer]').click()`);
  await nav.attendre(
    `location.pathname === '/referentiels/aliments'`,
    'retour après modification',
  );
  await nav.attendre(
    `!!window.__ligne && __ligne(${JSON.stringify(ALIMENT_TEST)})?.includes('610')`,
    'nouveau prix affiché',
  );
  verifier('modification enregistrée', true, 'prixKg=610');

  // --- Désactivation (D12 : on ne supprime pas un référentiel utilisé) ---
  await nav.evaluer(`window.confirm = () => true; true`);
  await nav.evaluer(`
    (() => {
      const tr = [...document.querySelectorAll('[data-test=ligne]')]
        .find(t => t.innerText.includes(${JSON.stringify(ALIMENT_TEST)}));
      tr.querySelector('[data-test=bouton-desactiver]').click();
      return true;
    })()
  `);
  await nav.attendre(
    `!document.body.innerText.includes(${JSON.stringify(ALIMENT_TEST)})`,
    'ligne retirée de la liste',
  );
  const avecInactifs = (await (
    await fetch(`${API}/referentiels/aliments?_end=200&inactifs=true`)
  ).json()) as { nom: string; actif: boolean }[];
  const conservee = avecInactifs.find((a) => a.nom === ALIMENT_TEST);
  verifier(
    'désactivation sans suppression',
    conservee !== undefined && conservee.actif === false,
    conservee ? `actif=${conservee.actif}` : 'ligne absente de la base',
  );

  // --- Contrainte métier remontée lisiblement, pas en 500 ---
  await nav.aller(`${ADMIN}/referentiels/paliers/nouveau`);
  await nav.attendre(`!!document.getElementById('tauxPct')`, 'formulaire palier');
  await nav.evaluer(OUTILS_SAISIE);
  await nav.evaluer(`
    (() => {
      const s = document.getElementById('especeId');
      const opt = [...s.options].find(o => o.value);
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(s), 'value').set;
      setter.call(s, opt.value);
      s.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()
  `);
  await nav.evaluer(`__saisir('poidsMin', 0)`);
  await nav.evaluer(`__saisir('poidsMax', 5)`);
  await nav.evaluer(`__saisir('tauxPct', 99)`);
  await nav.evaluer(`document.querySelector('[data-test=enregistrer]').click()`);
  await nav.attendre(`!!document.querySelector('[data-test=erreur]')`, 'message d’erreur affiché');
  const message = await nav.evaluer<string>(`document.querySelector('[data-test=erreur]').innerText`);
  verifier('contrainte SQL traduite en message lisible', message.includes('0 et 30'), message);

  // --- Navigation entre référentiels ---
  // Tous partagent la route `/referentiels/:ressource` : le composant n'est pas
  // remonté, et un tri hérité d'un autre référentiel casse la requête.
  await nav.aller(`${ADMIN}/referentiels/especes`);
  await nav.attendre(`document.querySelectorAll('[data-test=ligne]').length > 0`, 'liste des espèces');
  await nav.evaluer(`
    [...document.querySelectorAll('[data-test=nav] a')]
      .find(a => a.innerText.includes('Paliers')).click()
  `);
  await nav.attendre(
    `location.pathname === '/referentiels/paliers'`,
    'navigation vers les paliers',
  );
  // Exiger un en-tête propre aux paliers ET des lignes : compter trop tôt
  // validerait un tableau vide, ou pire, les lignes du référentiel précédent.
  await nav.attendre(
    `(
       !!document.querySelector('[data-test=colonne][data-champ=frequenceRepas]')
       && document.querySelectorAll('[data-test=ligne]').length > 0
     ) || !!document.querySelector('[data-test=erreur]')`,
    'tableau des paliers rempli',
  );
  const lignesPaliers = await nav.evaluer<number>(`document.querySelectorAll('[data-test=ligne]').length`);
  const erreurPaliers = await nav.evaluer<string>(
    `document.querySelector('[data-test=erreur]')?.innerText ?? ''`,
  );
  const paliersEnBase = ((await (
    await fetch(`${API}/referentiels/paliers?_start=0&_end=25&_sort=poidsMin&_order=asc`)
  ).json()) as unknown[]).length;
  verifier(
    'changement de référentiel sans tri hérité',
    erreurPaliers === '' && lignesPaliers === paliersEnBase,
    erreurPaliers || `${lignesPaliers} affichés / ${paliersEnBase} en base`,
  );
}

async function nettoyer() {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  try {
    await pool.query('DELETE FROM "Aliment" WHERE nom = $1', [ALIMENT_TEST]);
  } finally {
    await pool.end();
  }
}

await preconditions();
await authentifierEnAdmin(API);
// Aussi en début de parcours : une exécution interrompue laisse sa ligne
// derrière elle, et la création échouerait alors en doublon.
await nettoyer();

let nav: Navigateur | undefined;
try {
  nav = await ouvrirNavigateur();
  await connecterNavigateur(nav, ADMIN, OUTILS_SAISIE);
  await parcours(nav);
} catch (e) {
  verifier('parcours interrompu', false, (e as Error).message);
} finally {
  await nav?.fermer();
  await nettoyer();
}

for (const { libelle, ok, detail } of resultats) {
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${libelle.padEnd(42)} ${detail}`);
}
const echecs = resultats.filter((r) => !r.ok).length;
console.log(echecs === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${echecs} CONTROLE(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
