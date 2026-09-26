/**
 * Cas de référence : bassin B4 de la ferme Kotouba, cycle 2021-2022.
 * Les valeurs attendues sont celles calculées indépendamment lors de
 * l'analyse des classeurs d'origine. Ce test verrouille le portage.
 */
import { calculerIndicateurs } from '../src/indicateurs.js';
import type { CycleComplet } from '../src/types.js';

const TILAPIA = 'esp_tilapia';

const peseesData: Array<[string, number, Array<[number, number]>]> = [
  ['2021-07-30', 1, [[12, 455], [10, 392], [11, 418]]],
  ['2021-08-30', 2, [[10, 905], [12, 1108], [9, 820]]],
  ['2021-09-29', 3, [[10, 1560], [11, 1735], [10, 1585]]],
  ['2021-10-29', 4, [[8, 1815], [10, 2290], [9, 2050]]],
  ['2021-11-28', 5, [[8, 2350], [9, 2680], [8, 2375]]],
  ['2021-12-28', 6, [[7, 2455], [8, 2820], [7, 2450]]],
];

const d: CycleComplet = {
  cycle: { id: 'c1', numero: 1, dateMiseEnCharge: '2021-06-30', dateCloture: '2022-01-28', statut: 'BOUCLE', especeId: TILAPIA },
  infrastructure: { id: 'B4', nom: 'B4', mesureBase: 'SUPERFICIE', forme: 'RECTANGULAIRE', superficie: 100, volume: null },
  especes: [{ id: TILAPIA, nom: 'Tilapia du Nil', codeFao: 'TLN', gainJournalierRef: 2.1 }],
  lots: [{ id: 'lot1', especeId: TILAPIA, nombre: 1000, poidsMoyenG: 5, coutUnitaire: 110, dateMiseEnCharge: '2021-06-30' }],
  mortalites: [
    { id: 'm1', lotId: 'lot1', dateConstat: '2021-07-14', nombre: 38, remplacement: 0 },
    { id: 'm2', lotId: 'lot1', dateConstat: '2021-09-02', nombre: 22, remplacement: 0 },
  ],
  pesees: peseesData.map(([date, n]) => ({ id: `p${n}`, numero: n, dateOperation: date, tauxRationPct: 2.5 })),
  echantillons: peseesData.flatMap(([, n, ech]) =>
    ech.map(([nombre, poidsTotalG], i) => ({
      id: `e${n}_${i}`, peseeId: `p${n}`, lotId: 'lot1', numero: i + 1, nombre, poidsTotalG,
    })),
  ),
  distributions: [
    { id: 'd1', alimentId: 'sk12', dateDebut: '2021-06-30', quantiteTotaleKg: 22, prixKgApplique: 1150 },
    { id: 'd2', alimentId: 'sk18', dateDebut: '2021-08-01', quantiteTotaleKg: 64, prixKgApplique: 1150 },
    { id: 'd3', alimentId: 'sk2', dateDebut: '2021-09-15', quantiteTotaleKg: 118, prixKgApplique: 800 },
    { id: 'd4', alimentId: 'saba', dateDebut: '2021-10-15', quantiteTotaleKg: 390, prixKgApplique: 250 },
  ],
  traitements: [
    { id: 't1', dateOperation: '2021-08-12', quantite: 1, prixUnitaire: 3500, finDelaiAttente: '2021-09-11' },
    { id: 't2', dateOperation: '2021-11-05', quantite: 1, prixUnitaire: 3500, finDelaiAttente: '2021-12-05' },
  ],
  recoltes: [
    { id: 'r1', lotId: 'lot1', especeId: TILAPIA, dateOperation: '2022-01-12', type: 'VENTE', poidsKg: 120, prixKg: 1750 },
    { id: 'r2', lotId: 'lot1', especeId: TILAPIA, dateOperation: '2022-01-19', type: 'VENTE', poidsKg: 95, prixKg: 1750 },
    { id: 'r3', lotId: 'lot1', especeId: TILAPIA, dateOperation: '2022-01-26', type: 'VENTE', poidsKg: 65, prixKg: 1750 },
    { id: 'r4', lotId: 'lot1', especeId: TILAPIA, dateOperation: '2022-01-26', type: 'DON', poidsKg: 25, prixKg: 1750 },
    { id: 'r5', lotId: 'lot1', especeId: TILAPIA, dateOperation: '2022-01-28', type: 'AUTOCONSOMMATION', poidsKg: 25, prixKg: 1750 },
  ],
  depenses: [
    { id: 'x1', categorie: 'EAU', montant: 25000, dateOperation: '2022-01-28' },
    { id: 'x2', categorie: 'MAIN_OEUVRE', montant: 90000, dateOperation: '2022-01-28' },
  ],
};

const i = calculerIndicateurs(d);

const attendu: Array<[string, unknown, unknown]> = [
  ['effectif final', i.zootechnie.effectifFinal, 940],
  ['taux de survie %', i.zootechnie.tauxSurviePct, 94],
  ['poids moyen final g', Math.round(i.zootechnie.poidsMoyenFinalG), 351],
  ['production kg', i.production.productionRecolteeKg, 330],
  ['charges alevins', i.economie.charges.alevins, 110000],
  ['charges aliments', i.economie.charges.aliments, 290800],
  ['charges traitements', i.economie.charges.traitements, 7000],
  ['charges autres', i.economie.charges.autres, 115000],
  ['total charges', i.economie.charges.total, 522800],
  ['total produits', i.economie.produits.total, 577500],
  ['prix de revient F/kg', i.economie.prixRevientKg, 1584],
  ['prix de vente F/kg', i.economie.prixVenteMoyenKg, 1750],
  ['marge F/kg', i.economie.margeKg, 166],
  ['résultat F', i.economie.resultat, 54700],
  ['rentabilité %', i.economie.rentabilitePct, 10.46],
  ['récoltes non conformes', i.conformite.recoltesNonConformes, 0],
];

let echecs = 0;
for (const [nom, obtenu, voulu] of attendu) {
  const ok = obtenu === voulu;
  if (!ok) echecs++;
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${nom.padEnd(24)} obtenu=${obtenu}  attendu=${voulu}`);
}

console.log('\n--- indicateurs dérivés (non verrouillés, pour lecture) ---');
console.log(`  durée du cycle           ${i.cycle.dureeJours} jours`);
console.log(`  gain moyen quotidien     ${i.zootechnie.gainMoyenQuotidienGJ} g/j (référence espèce 2,1)`);
console.log(`  performance / référence  ${i.zootechnie.performance}`);
console.log(`  TCS                      ${i.zootechnie.tauxCroissanceSpecifiquePctJ} %/jour`);
console.log(`  coefficient de variation ${i.zootechnie.coefficientVariationPct} %`);
console.log(`  indice de consommation   ${i.alimentation.indiceConsommation}`);
console.log(`  densité initiale         ${i.production.densiteInitiale} /${i.production.uniteMesure}`);
console.log(`  charge finale            ${i.production.chargeFinale} kg/${i.production.uniteMesure}`);
console.log(`  rendement annualisé      ${i.production.rendementAnnuel?.valeur} ${i.production.rendementAnnuel?.unite}`);

console.log(echecs === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${echecs} CONTROLE(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
