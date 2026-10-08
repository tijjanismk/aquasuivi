/// Parcours de saisie dans un navigateur réel : créer une ferme, un bassin,
/// un cycle, le peupler, et voir ses indicateurs s'afficher.
///
/// C'est la chaîne complète — écran → API → base → calcul → écran — que ni le
/// typecheck ni le parcours des référentiels ne couvrent.
///
/// Prérequis : `pnpm dev:api` et `pnpm dev:admin`.

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
const FERME_TEST = 'Ferme parcours saisie';

const resultats: { libelle: string; ok: boolean; detail: string }[] = [];
function verifier(libelle: string, ok: boolean, detail: unknown = '') {
  resultats.push({
    libelle,
    ok,
    detail: String(detail ?? '').replace(/\s+/g, ' ').slice(0, 80),
  });
}

async function nettoyer() {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  try {
    // Cascade : Ferme → Infrastructure → Cycle → lots, pesées, récoltes…
    await pool.query('DELETE FROM "Ferme" WHERE nom = $1', [FERME_TEST]);
  } finally {
    await pool.end();
  }
}

/// Remplit un formulaire et enregistre, puis attend l'arrivée sur `destination`.
async function remplirEtEnregistrer(
  nav: Navigateur,
  champs: Record<string, string | number | boolean>,
  destination: string,
  libelle: string,
) {
  await nav.evaluer(OUTILS_SAISIE);
  for (const [nom, valeur] of Object.entries(champs)) {
    await nav.evaluer(`__saisir(${JSON.stringify(nom)}, ${JSON.stringify(valeur)})`);
  }
  await nav.evaluer(`document.querySelector('[data-test=enregistrer]').click()`);
  await nav.attendre(
    `location.pathname.startsWith(${JSON.stringify(destination)})`,
    `retour vers ${destination} après ${libelle}`,
  );
}

/// Choisit la première option non vide d'un `select` de relation.
async function choisirPremiereOption(nav: Navigateur, champ: string) {
  await nav.attendre(
    `(document.getElementById(${JSON.stringify(champ)})?.options.length ?? 0) > 1`,
    `options chargées pour ${champ}`,
  );
  await nav.evaluer(`
    (() => {
      const s = document.getElementById(${JSON.stringify(champ)});
      const opt = [...s.options].find(o => o.value);
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(s), 'value').set;
      setter.call(s, opt.value);
      s.dispatchEvent(new Event('change', { bubbles: true }));
      return opt.textContent;
    })()
  `);
}

async function choisirOptionParTexte(nav: Navigateur, champ: string, texte: string) {
  await nav.attendre(
    `[...(document.getElementById(${JSON.stringify(champ)})?.options ?? [])]
       .some(o => o.value && o.textContent.includes(${JSON.stringify(texte)}))`,
    `option « ${texte} » disponible`,
  );
  await nav.evaluer(`
    (() => {
      const s = document.getElementById(${JSON.stringify(champ)});
      const opt = [...s.options].find(o => o.value && o.textContent.includes(${JSON.stringify(texte)}));
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(s), 'value').set;
      setter.call(s, opt.value);
      s.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()
  `);
}

const idCourant = (nav: Navigateur) =>
  nav.evaluer<string>(`location.pathname.split('/').filter(Boolean).pop()`);

async function parcours(nav: Navigateur) {
  // --- Une ferme ---
  await nav.aller(`${ADMIN}/fermes/nouveau`);
  await nav.attendre(`!!document.getElementById('nom')`, 'formulaire de ferme');
  await remplirEtEnregistrer(
    nav,
    { nom: FERME_TEST, promoteur: 'Parcours automatisé', village: 'Kotouba' },
    '/fermes',
    'création de la ferme',
  );
  await nav.attendre(
    `!!window.__ligne && __ligne(${JSON.stringify(FERME_TEST)})`,
    'ferme visible dans la liste',
  );
  await nav.evaluer(OUTILS_SAISIE);
  verifier('création d’une ferme', true, FERME_TEST);

  // --- Ouvrir sa fiche ---
  await nav.evaluer(`
    (() => {
      const tr = [...document.querySelectorAll('[data-test=ligne]')]
        .find(t => t.innerText.includes(${JSON.stringify(FERME_TEST)}));
      tr.querySelector('[data-test=lien-modifier]').click();
      return true;
    })()
  `);
  await nav.attendre(
    `!!document.querySelector('[data-test=tableau][data-ressource=infrastructures]')`,
    'fiche de la ferme',
  );
  const fermeId = await idCourant(nav);
  verifier('fiche ferme avec ses infrastructures', Boolean(fermeId), fermeId);

  // --- Une infrastructure : 10 × 10 m, la superficie doit être calculée ---
  await nav.aller(
    `${ADMIN}/saisie/infrastructures/nouveau?fermeId=${fermeId}&retour=${encodeURIComponent(`/fermes/${fermeId}`)}`,
  );
  await nav.attendre(`!!document.getElementById('nom')`, 'formulaire d’infrastructure');
  await choisirOptionParTexte(nav, 'typeInfrastructureId', 'Rizipisciculture');
  await remplirEtEnregistrer(
    nav,
    { nom: 'B4', longueur: 10, largeur: 10 },
    `/fermes/${fermeId}`,
    'création de l’infrastructure',
  );
  await nav.evaluer(OUTILS_SAISIE);
  await nav.attendre(`!!window.__ligne && __ligne('B4')`, 'infrastructure visible');
  const ligneInfra = await nav.evaluer<string>(`__ligne('B4')`);
  verifier(
    'superficie calculée à l’écriture (100 m²)',
    ligneInfra.includes('100'),
    ligneInfra,
  );

  // --- Un cycle ---
  await nav.evaluer(`
    (() => {
      const tr = [...document.querySelectorAll('[data-test=ligne]')]
        .find(t => t.innerText.includes('B4'));
      tr.querySelector('[data-test=lien-modifier]').click();
      return true;
    })()
  `);
  await nav.attendre(
    `!!document.querySelector('[data-test=tableau][data-ressource=cycles]')`,
    'fiche de l’infrastructure',
  );
  const infraId = await idCourant(nav);

  await nav.aller(
    `${ADMIN}/saisie/cycles/nouveau?infrastructureId=${infraId}&retour=${encodeURIComponent(`/infrastructures/${infraId}`)}`,
  );
  await nav.attendre(`!!document.getElementById('numero')`, 'formulaire de cycle');
  await remplirEtEnregistrer(
    nav,
    { numero: 1, dateMiseEnCharge: '2021-06-30' },
    `/infrastructures/${infraId}`,
    'création du cycle',
  );
  await nav.evaluer(OUTILS_SAISIE);
  await nav.attendre(`document.querySelectorAll('[data-test=ligne]').length > 0`, 'cycle visible');
  verifier('création d’un cycle', true, 'cycle n° 1');

  // --- Sa fiche, avec les sections et les indicateurs ---
  await nav.evaluer(`document.querySelector('[data-test=lien-modifier]').click()`);
  await nav.attendre(`!!document.querySelector('[data-test=indicateurs]')`, 'fiche du cycle');
  const cycleId = await idCourant(nav);

  const sections = await nav.evaluer<string[]>(`
    [...document.querySelectorAll('[data-test=tableau]')].map(t => t.dataset.ressource)
  `);
  const attendues = [
    'lots',
    'pesees',
    'distributions',
    'traitements',
    'recoltes',
    'depenses',
    'mesures-eau',
  ];
  verifier(
    'les 7 sections du cycle sont présentes',
    attendues.every((s) => sections.includes(s)),
    sections.join(', '),
  );

  // --- Un lot, puis une dépense : de quoi faire parler les indicateurs ---
  await nav.aller(
    `${ADMIN}/saisie/lots/nouveau?cycleId=${cycleId}&retour=${encodeURIComponent(`/cycles/${cycleId}`)}`,
  );
  await nav.attendre(`!!document.getElementById('nombre')`, 'formulaire de lot');
  await choisirOptionParTexte(nav, 'especeId', 'Tilapia du Nil');
  await remplirEtEnregistrer(
    nav,
    { nombre: 1000, poidsMoyenG: 5, coutUnitaire: 110, dateMiseEnCharge: '2021-06-30' },
    `/cycles/${cycleId}`,
    'création du lot',
  );
  verifier('ajout d’un lot depuis la fiche du cycle', true, '1000 alevins');

  await nav.aller(
    `${ADMIN}/saisie/depenses/nouveau?cycleId=${cycleId}&retour=${encodeURIComponent(`/cycles/${cycleId}`)}`,
  );
  await nav.attendre(`!!document.getElementById('montant')`, 'formulaire de dépense');
  await remplirEtEnregistrer(
    nav,
    { dateOperation: '2021-07-01', montant: 25000 },
    `/cycles/${cycleId}`,
    'création de la dépense',
  );

  // Les indicateurs sont recalculés par l'API à chaque affichage.
  await nav.attendre(
    `document.querySelector('[data-test=indicateurs]')?.innerText.includes('Charges')`,
    'indicateurs affichés',
  );
  const texteIndicateurs = await nav.evaluer<string>(
    `document.querySelector('[data-test=indicateurs]').innerText.replace(/\\s+/g, ' ')`,
  );
  // 1000 alevins à 110 + 25 000 de dépense = 135 000.
  verifier(
    'charges calculées et formatées en devise',
    texteIndicateurs.includes('135 000') && texteIndicateurs.includes('F CFA'),
    texteIndicateurs.slice(0, 80),
  );

  // --- Une date de terrain ne doit pas dériver d'un jour ---
  const lots = (await (
    await fetch(`${API}/saisie/lots?cycleId=${cycleId}&_end=10`)
  ).json()) as { dateMiseEnCharge: string }[];
  verifier(
    'date saisie conservée sans dérive de fuseau',
    lots[0]?.dateMiseEnCharge === '2021-06-30',
    lots[0]?.dateMiseEnCharge,
  );

  // --- Pêche de contrôle (D28, D29) : la ration se fixe sur le poids du jour ---
  // 1 000 poissons pesés à 30 g → 30 kg de biomasse, × 4 % retenus = 1,2 kg/j.
  await nav.aller(
    `${ADMIN}/saisie/pesees/nouveau?cycleId=${cycleId}&retour=${encodeURIComponent(`/cycles/${cycleId}`)}`,
  );
  await nav.attendre(`document.querySelectorAll('[data-test=ech-nombre]').length === 3`, 'formulaire de pesée');
  await nav.evaluer(OUTILS_SAISIE);
  await nav.evaluer(`__saisir('dateOperation', '2021-07-30')`);
  await nav.evaluer(`__saisir('tauxRationPct', '4')`);
  await nav.evaluer(`(() => {
    const poser = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    poser(document.querySelector('[data-test=ech-nombre]'), '10');
    poser(document.querySelector('[data-test=ech-poids]'), '300');
    return true; })()`);
  await nav.attendre(
    `(document.querySelector('[data-test=ration-jour]')?.innerText ?? '').includes('1,2')`,
    'ration calculée par l’API sur le poids du jour',
  );
  verifier('pesée : ration sur la biomasse du jour', true, '1,2 kg/j');
  await nav.attendre(`(document.querySelector('[data-test=aliment]')?.options.length ?? 0) > 1`, 'aliments chargés');
  await nav.evaluer(`(() => {
    const s = document.querySelector('[data-test=aliment]');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, s.options[1].value);
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return true; })()`);
  await nav.evaluer(`document.querySelector('[data-test=enregistrer]').click()`);
  await nav.attendre(`location.pathname === ${JSON.stringify(`/cycles/${cycleId}`)}`, 'pesée enregistrée');

  const distributions = (await (
    await fetch(`${API}/saisie/distributions?cycleId=${cycleId}&_end=10`)
  ).json()) as { rationKgJour: number | string | null; quantiteTotaleKg: unknown; peseeId: string | null }[];
  const d = distributions[0];
  verifier(
    'pesée : ration enregistrée, liée, sans quantité',
    distributions.length === 1 && Number(d?.rationKgJour) === 1.2 && d?.quantiteTotaleKg == null && !!d?.peseeId,
    JSON.stringify(d),
  );
  // Ration encore ouverte : comptée jusqu'à aujourd'hui inclus.
  const indicateurs = (await (await fetch(`${API}/cycles/${cycleId}/indicateurs`)).json()) as {
    alimentation: { alimentDistribueKg: number; rationEnCoursKgJour: number | null };
  };
  const demain = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const jours = Math.round((Date.parse(`${demain}T00:00:00Z`) - Date.parse('2021-07-30T00:00:00Z')) / 86_400_000);
  verifier(
    'aliment : ration × jours depuis la pêche',
    indicateurs.alimentation.alimentDistribueKg === Math.round(1.2 * jours * 1000) / 1000 &&
      indicateurs.alimentation.rationEnCoursKgJour === 1.2,
    JSON.stringify(indicateurs.alimentation),
  );
}

const joignable = async (url: string) => {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
};
if (!(await joignable(`${API}/sante`)) || !(await joignable(ADMIN))) {
  console.error(`API (${API}) et admin (${ADMIN}) doivent tourner.`);
  process.exit(1);
}
await authentifierEnAdmin(API);

await nettoyer();
let nav: Navigateur | undefined;
try {
  nav = await ouvrirNavigateur(9335);
  await connecterNavigateur(nav, ADMIN, OUTILS_SAISIE);
  await parcours(nav);
} catch (e) {
  verifier('parcours interrompu', false, (e as Error).message);
} finally {
  await nav?.fermer();
  await nettoyer();
}

for (const { libelle, ok, detail } of resultats) {
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${libelle.padEnd(46)} ${detail}`);
}
const echecs = resultats.filter((r) => !r.ok).length;
console.log(echecs === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${echecs} CONTROLE(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
