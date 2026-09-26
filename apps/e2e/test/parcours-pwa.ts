/// PWA de terrain (étape 7, D19), en navigateur réel et **en mode avion**.
///
/// Critère de fin de l'étape : un cycle saisi hors ligne, synchronisé au
/// retour du réseau, donne les mêmes indicateurs que ceux du serveur. On le
/// vérifie sur le **build de production** : c'est lui que le service worker
/// met en cache, et c'est lui qui doit se recharger sans réseau.
///
/// Prérequis : l'API, et la PWA construite puis servie :
///   pnpm --filter @aqua/pwa build && pnpm --filter @aqua/pwa preview

import { Pool } from 'pg';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ouvrirNavigateur, OUTILS_SAISIE, type Navigateur } from './navigateur.ts';

process.loadEnvFile(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env'),
);

const API = process.env['E2E_API_URL'] ?? 'http://localhost:3000/api';
const PWA = process.env['E2E_PWA_URL'] ?? 'http://localhost:5181';
const NOM_TEST = 'Parcours PWA';
const TELEPHONE = `+2237${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
const MOT_DE_PASSE = 'bassin-pwa-2026';

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
  await sql(`DELETE FROM "ConflitSync" WHERE "userId" IN (SELECT id FROM "User" WHERE nom = $1)`, [NOM_TEST]);
  await sql(
    `DELETE FROM "Ferme" WHERE id IN (
       SELECT a."fermeId" FROM "AccesFerme" a JOIN "User" u ON u.id = a."userId" WHERE u.nom = $1)`,
    [NOM_TEST],
  );
  await sql('DELETE FROM "User" WHERE nom = $1', [NOM_TEST]);
}

/// Chiffre affiché → nombre : « 1 234,5 », « 54 700 F CFA ».
const lireNombre = (texte: string | null) =>
  texte === null ? null : Number(texte.replace(/[^\d,-]/g, '').replace(',', '.'));

async function parcours(nav: Navigateur) {
  const ev = <T>(js: string) => nav.evaluer<T>(js);
  const outils = () => ev(OUTILS_SAISIE);
  const saisir = async (champs: Record<string, string>) => {
    await outils();
    for (const [nom, valeur] of Object.entries(champs)) {
      await ev(`window.__saisir(${JSON.stringify(`champ-${nom}`)}, ${JSON.stringify(valeur)})`);
    }
  };
  /// Première option non vide d'une liste déroulante (référentiel).
  const premiereOption = (nom: string, filtre = '') =>
    ev<string>(`[...document.getElementById('champ-${nom}').options].find(o => o.value && o.text.includes(${JSON.stringify(filtre)}))?.value ?? ''`);
  const cliquer = (selecteur: string) => ev(`document.querySelector(${JSON.stringify(selecteur)}).click(), true`);
  const attendreChemin = (motif: string, libelle: string) =>
    nav.attendre(`new RegExp(${JSON.stringify(motif)}).test(location.pathname)`, libelle);
  const enregistrer = async (chemin: string, libelle: string) => {
    await cliquer('[data-test=enregistrer]');
    await attendreChemin(chemin, libelle);
  };
  const cheminId = () => ev<string>('location.pathname.split("/").pop()');

  // --- Inscription en ligne : la seule étape qui exige du réseau ---
  await nav.aller(`${PWA}/connexion`);
  await nav.attendre(`!!document.querySelector('[data-test=form-connexion]')`, 'écran de connexion');
  await cliquer('[data-test=onglet-inscription]');
  await nav.attendre(`!!document.getElementById('nom')`, 'formulaire d’inscription');
  await outils();
  for (const [id, v] of Object.entries({ nom: NOM_TEST, identifiant: TELEPHONE, motDePasse: MOT_DE_PASSE })) {
    await ev(`window.__saisir(${JSON.stringify(id)}, ${JSON.stringify(v)})`);
  }
  await cliquer('[data-test=valider]');
  await nav.attendre(`document.querySelector('[data-test=titre]')?.innerText === 'Mes fermes'`, 'accueil après inscription');
  await nav.attendre(`!(document.querySelector('[data-test=etat-sync]')?.innerText ?? '').includes('Synchronisation')`, 'première synchronisation');

  // --- Installable : manifeste, icônes, service worker actif ---
  const manifeste = await ev<{ display?: string; icons?: { sizes: string }[] }>(
    `fetch(document.querySelector('link[rel=manifest]').href).then(r => r.json())`,
  );
  verifier('manifeste : affichage autonome', manifeste.display, 'standalone');
  verifier('manifeste : icône 512 px', manifeste.icons?.some((i) => i.sizes === '512x512'), true);
  await ev(`navigator.serviceWorker.ready.then(() => true)`);
  // Premier chargement : le service worker s'installe mais ne contrôle la
  // page qu'au suivant.
  await nav.aller(`${PWA}/`);
  await nav.attendre(`!!navigator.serviceWorker.controller`, 'page contrôlée par le service worker');
  verifier('service worker actif', await ev<boolean>('!!navigator.serviceWorker.controller'), true);

  // --- Mode avion ---
  await nav.horsLigne(true);
  await nav.attendre(`(document.querySelector('[data-test=etat-sync]')?.innerText ?? '').includes('Hors ligne')`, 'bandeau hors ligne');
  verifier('bandeau « hors ligne »', true, true);

  await nav.aller(`${PWA}/saisie/fermes/nouveau`);
  await nav.attendre(`!!document.getElementById('champ-nom')`, 'formulaire ferme servi hors ligne');
  verifier('interface servie sans réseau (service worker)', true, true);
  await saisir({ nom: `${NOM_TEST} ferme`, village: 'Kotouba' });
  await enregistrer('^/fermes/', 'ferme créée hors ligne');
  const fermeId = await cheminId();

  await nav.aller(`${PWA}/saisie/infrastructures/nouveau?ferme=${fermeId}`);
  await nav.attendre(`document.getElementById('champ-typeInfrastructureId')?.options.length > 1`, 'types de bassin disponibles hors ligne');
  await saisir({ nom: 'B4', typeInfrastructureId: await premiereOption('typeInfrastructureId', 'Rizipisciculture'), longueur: '10', largeur: '10' });
  await enregistrer('^/fermes/', 'bassin créé hors ligne');
  await nav.attendre(`!!document.querySelector('[data-test=bassin]')`, 'bassin listé');
  const b4 = await ev<string>(`document.querySelector('[data-test=bassin]').getAttribute('href').split('/').pop()`);

  await nav.aller(`${PWA}/saisie/cycles/nouveau?infrastructure=${b4}`);
  await nav.attendre(`document.getElementById('champ-especeId')?.options.length > 1`, 'espèces disponibles hors ligne');
  await saisir({ dateMiseEnCharge: '2021-06-30', especeId: await premiereOption('especeId', 'Tilapia du Nil') });
  await enregistrer('^/cycles/', 'cycle ouvert hors ligne');
  const cycleId = await cheminId();

  const formulaire = async (ressource: string, champs: Record<string, string>, references: Record<string, string> = {}) => {
    await nav.aller(`${PWA}/saisie/${ressource}/nouveau?cycle=${cycleId}`);
    await nav.attendre(`!!document.querySelector('[data-test=formulaire]')`, `formulaire ${ressource}`);
    const valeurs = { ...champs };
    for (const [nom, filtre] of Object.entries(references)) {
      await nav.attendre(`document.getElementById('champ-${nom}')?.options.length > 1`, `choix ${nom}`);
      valeurs[nom] = await premiereOption(nom, filtre);
    }
    await saisir(valeurs);
    await enregistrer(`^/cycles/${cycleId}$`, `${ressource} enregistré`);
  };

  // Un cycle B4 abrégé : mêmes ordres de grandeur que test/b4.ts.
  await formulaire('lots', { nombre: '1000', poidsMoyenG: '5', coutUnitaire: '110', dateMiseEnCharge: '2021-06-30' }, { especeId: 'Tilapia du Nil' });
  await formulaire('mortalites', { dateConstat: '2021-07-14', nombre: '38' }, { lotId: '' });
  await formulaire('mortalites', { dateConstat: '2021-09-02', nombre: '22' }, { lotId: '' });

  // Contrôle hors ligne : même règle que l'API, sans réseau.
  await nav.aller(`${PWA}/saisie/mortalites/nouveau?cycle=${cycleId}`);
  await nav.attendre(`document.getElementById('champ-lotId')?.options.length > 1`, 'lots du cycle');
  await saisir({ lotId: await premiereOption('lotId'), dateConstat: '2021-09-03', nombre: '5000' });
  await cliquer('[data-test=enregistrer]');
  await nav.attendre(`!!document.querySelector('[data-test=erreur-champ]')`, 'refus local');
  verifier('contrôle local : plus de morts que de poissons', await ev<string>(`document.querySelector('[data-test=erreur-champ]').innerText`), 'Il ne reste que 940 poisson(s) dans ce lot.');

  for (const [dateOperation, echantillons] of [
    ['2021-11-28', [[8, 2350], [9, 2680], [8, 2375]]],
    ['2021-12-28', [[7, 2455], [8, 2820], [7, 2450]]],
  ] as [string, [number, number][]][]) {
    await nav.aller(`${PWA}/cycles/${cycleId}/pesee`);
    await nav.attendre(`document.querySelectorAll('[data-test=ech-nombre]').length === 3`, 'formulaire de pesée');
    await saisir({ dateOperation, tauxRationPct: '2,5' });
    await ev(`(() => {
      const poser = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      const n = document.querySelectorAll('[data-test=ech-nombre]'); const p = document.querySelectorAll('[data-test=ech-poids]');
      ${JSON.stringify(echantillons)}.forEach(([a, b], i) => { poser(n[i], String(a)); poser(p[i], String(b)); });
      return true; })()`);
    await nav.attendre(`(document.querySelector('[data-test=moyenne]')?.innerText ?? '').includes('g en moyenne')`, 'poids moyen calculé en direct');
    await enregistrer(`^/cycles/${cycleId}$`, 'pesée enregistrée');
  }

  await formulaire('distributions', { dateDebut: '2021-06-30', quantiteTotaleKg: '204', prixKgApplique: '1000' }, { alimentId: '' });
  await formulaire('distributions', { dateDebut: '2021-10-15', quantiteTotaleKg: '390', prixKgApplique: '250' }, { alimentId: '' });
  await formulaire('traitements', { dateOperation: '2021-08-12', quantite: '1', prixUnitaire: '3500' }, { produitSanitaireId: 'Oxyfuran' });
  await formulaire('recoltes', { dateOperation: '2022-01-12', poidsKg: '215', prixKg: '1750' });
  await formulaire('recoltes', { dateOperation: '2022-01-26', poidsKg: '65,5', prixKg: '1750', type: 'DON' });
  await formulaire('depenses', { montant: '90000', dateOperation: '2022-01-28', categorie: 'MAIN_OEUVRE' });

  // --- Toujours hors ligne : indicateurs calculés sur le téléphone ---
  await nav.aller(`${PWA}/cycles/${cycleId}`);
  await nav.attendre(`!!document.querySelector('[data-test=indicateurs]')`, 'indicateurs hors ligne');
  const lire = (t: string) => ev<string | null>(`document.querySelector('[data-test=${t}]')?.innerText ?? null`);
  const local = {
    effectif: lireNombre(await lire('effectif')),
    poids: lireNombre(await lire('poids-moyen')),
    biomasse: lireNombre(await lire('biomasse')),
    survie: lireNombre(await lire('survie')),
    ic: lireNombre(await lire('ic')),
    resultat: lireNombre(await lire('resultat')),
  };
  verifier('effectif calculé hors ligne', local.effectif, 940);
  verifier('ration conseillée affichée', (await lire('ration'))?.includes('kg') ?? false, true);
  const attente = lireNombre(await lire('en-attente'));
  verifier('saisies en file d’attente', (attente ?? 0) > 10, true);
  verifier('lignes marquées « non envoyé »', await ev<boolean>(`document.querySelectorAll('[data-test=non-envoye]').length > 0`), true);

  // Rechargement complet sans réseau : interface par le service worker,
  // données par IndexedDB, session conservée.
  await nav.aller(`${PWA}/cycles/${cycleId}`);
  await nav.attendre(`!!document.querySelector('[data-test=effectif]')`, 'rechargement hors ligne');
  verifier('rechargement hors ligne : données intactes', lireNombre(await lire('effectif')), 940);

  // --- Retour du réseau ---
  // Au retour du réseau, l'application relance seule (évènement `online`,
  // puis relances espacées) ; l'agent peut aussi appuyer sur le bouton,
  // ce que fait le test pour ne pas attendre la relance.
  await nav.horsLigne(false);
  await nav.attendre(`!document.querySelector('[data-test=synchroniser]')?.disabled`, 'bouton de synchronisation actif');
  await cliquer('[data-test=synchroniser]');
  await nav.attendre(
    `!document.querySelector('[data-test=en-attente]') || !!document.querySelector('[data-test=lien-corrections]')`,
    'synchronisation au retour du réseau',
  );
  verifier('tout est parti, rien à corriger', await ev<boolean>(`!document.querySelector('[data-test=lien-corrections]')`), true);

  // --- Comparaison avec le serveur ---
  const connexion = (await (await fetch(`${API}/auth/connexion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifiant: TELEPHONE, motDePasse: MOT_DE_PASSE }),
  })).json()) as { jetonAcces: string };
  const serveur = (await (await fetch(`${API}/cycles/${cycleId}/indicateurs`, {
    headers: { Authorization: `Bearer ${connexion.jetonAcces}` },
  })).json()) as Record<string, any>;

  verifier('serveur : même effectif', serveur['zootechnie']?.effectifFinal, local.effectif);
  verifier('serveur : même poids moyen', Math.round(serveur['zootechnie']?.poidsMoyenFinalG * 10) / 10, local.poids);
  verifier('serveur : même survie', serveur['zootechnie']?.tauxSurviePct, local.survie);
  verifier('serveur : même indice de conso.', Math.round(serveur['alimentation']?.indiceConsommation * 100) / 100, local.ic);
  verifier('serveur : même résultat', serveur['economie']?.resultat, local.resultat);
  verifier('serveur : même biomasse', Math.round(serveur['production']?.biomasseFinaleKg * 10) / 10, local.biomasse);
  const [delai] = await sql('SELECT "finDelaiAttente"::text AS fin FROM "Traitement" WHERE "cycleId" = $1', [cycleId]);
  verifier('délai d’attente recalculé au serveur', typeof delai?.fin, 'string');
}

/// Conflit réel : pendant que le téléphone est hors ligne, un autre appareil
/// ouvre un cycle sur le même bassin. À la synchronisation, le cycle du
/// téléphone est refusé, l'agent le voit dans « À corriger » et peut
/// l'abandonner pour reprendre la version du serveur.
async function conflit(nav: Navigateur) {
  const ev = <T>(js: string) => nav.evaluer<T>(js);
  const connexion = (await (await fetch(`${API}/auth/connexion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifiant: TELEPHONE, motDePasse: MOT_DE_PASSE }),
  })).json()) as { jetonAcces: string };
  const jeton = connexion.jetonAcces;
  const appel = async (methode: string, chemin: string, corps?: unknown) =>
    (await fetch(`${API}${chemin}`, {
      method: methode,
      headers: { Authorization: `Bearer ${jeton}`, ...(corps ? { 'Content-Type': 'application/json' } : {}) },
      ...(corps ? { body: JSON.stringify(corps) } : {}),
    })).json() as Promise<any>;

  const fermes = (await appel('GET', '/saisie/fermes')) as { id: string }[];
  const types = (await appel('GET', '/referentiels/types-infrastructure?_end=1')) as { id: string }[];
  const b6 = await appel('POST', '/saisie/infrastructures', { nom: 'B6', fermeId: fermes[0]!.id, typeInfrastructureId: types[0]!.id });

  // Le téléphone récupère B6, puis passe hors ligne.
  await nav.aller(`${PWA}/bassins/${b6.id}`);
  await ev(`document.querySelector('[data-test=synchroniser]')?.click(), true`);
  await nav.attendre(`!!document.querySelector('[data-test=nouveau-cycle]')`, 'B6 reçu sur le téléphone');
  await nav.horsLigne(true);
  await nav.aller(`${PWA}/saisie/cycles/nouveau?infrastructure=${b6.id}`);
  await nav.attendre(`!!document.getElementById('champ-dateMiseEnCharge')`, 'cycle B6 hors ligne');
  await ev(OUTILS_SAISIE);
  await ev(`window.__saisir('champ-dateMiseEnCharge', '2022-03-01')`);
  await ev(`document.querySelector('[data-test=enregistrer]').click(), true`);
  await nav.attendre(`/^\\/cycles\\//.test(location.pathname)`, 'cycle B6 enregistré hors ligne');

  // L'encadreur, lui, a ouvert B6 depuis le bureau.
  await appel('POST', '/saisie/cycles', { infrastructureId: b6.id, dateMiseEnCharge: '2022-02-15' });

  await nav.horsLigne(false);
  await nav.attendre(`!!document.querySelector('[data-test=lien-corrections]')`, 'refus signalé après synchronisation');
  await nav.aller(`${PWA}/corrections`);
  await nav.attendre(`!!document.querySelector('[data-test=rejet]')`, 'écran des corrections');
  verifier('motif du refus lisible', await ev<string>(`document.querySelector('[data-test=motif]').innerText`), "Cette infrastructure a déjà un cycle ouvert. Clôturez-le avant d'en ouvrir un autre.");

  await ev(`window.confirm = () => true; document.querySelector('[data-test=abandonner]').click(), true`);
  await nav.attendre(`!!document.querySelector('[data-test=vide]')`, 'plus rien à corriger');
  await nav.aller(`${PWA}/bassins/${b6.id}`);
  await nav.attendre(`document.querySelectorAll('[data-test=cycle]').length === 1 && document.querySelector('[data-test=cycle]').innerText.includes('15/02/2022')`, 'cycle du serveur repris');
  verifier('après abandon : le cycle du serveur remplace celui du téléphone', true, true);
}

const joignable = async (url: string) => fetch(url).then((r) => r.ok).catch(() => false);
if (!(await joignable(`${API}/sante`)) || !(await joignable(PWA))) {
  console.error(`API (${API}) et PWA (${PWA}, build de production) doivent tourner.`);
  process.exit(1);
}

await nettoyer();
let nav: Navigateur | undefined;
try {
  nav = await ouvrirNavigateur(9337);
  await parcours(nav);
  await conflit(nav);
} catch (e) {
  resultats.push({ libelle: 'parcours interrompu', ok: false, detail: (e as Error).message });
} finally {
  await nav?.fermer();
  await nettoyer();
}

for (const { libelle, ok, detail } of resultats) {
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${libelle.padEnd(52)} ${detail}`);
}
const echecs = resultats.filter((r) => !r.ok).length;
console.log(echecs === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${echecs} CONTROLE(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
