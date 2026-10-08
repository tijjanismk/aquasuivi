/**
 * Ration fixée à la pêche de contrôle (D29) : elle court jusqu'à la pêche
 * suivante, et la quantité de la période s'en déduit. Cas tirés du tableur
 * Kotouba (cage R1) : pêche 1 le 20/10/2022, pêche 2 le 21/11/2022, ration
 * = biomasse × 3 %.
 */
import { quantiteDistribuee } from '../src/alimentation.js';
import { calculerIndicateurs } from '../src/indicateurs.js';
import { cycleAuJourDeLaPesee, rationDuCycle } from '../src/rationnement.js';
import type { CycleComplet, Distribution, PalierRationnement } from '../src/types.js';

const P1 = '2022-10-20';
const P2 = '2022-11-21';
const pesees = [{ dateOperation: P1 }, { dateOperation: P2 }];
const ration = (r: number, debut = P1, extra: Partial<Distribution> = {}): Distribution =>
  ({ id: 'd', alimentId: 'a', dateDebut: debut, rationKgJour: r, ...extra });
const kg = (d: Distribution, ctx: Parameters<typeof quantiteDistribuee>[1]) => quantiteDistribuee(d, ctx).kg;

// Cycle : 4 000 clarias de 5 g, une pêche le 20/10 à 48,84 g.
const cycle = (): CycleComplet => ({
  cycle: { id: 'c', numero: 1, dateMiseEnCharge: '2022-09-20', statut: 'EN_COURS', especeId: 'cl' },
  infrastructure: { id: 'i', nom: 'cage R1', mesureBase: 'VOLUME', forme: 'RECTANGULAIRE', volume: 38.4 },
  lots: [{ id: 'l', especeId: 'cl', nombre: 4000, poidsMoyenG: 5, coutUnitaire: 150, dateMiseEnCharge: '2022-09-20' }],
  mortalites: [{ id: 'm', lotId: 'l', dateConstat: '2022-11-01', nombre: 100, remplacement: 0 }],
  pesees: [{ id: 'p1', numero: 1, dateOperation: P1 }],
  echantillons: [{ id: 'e1', peseeId: 'p1', lotId: 'l', numero: 1, nombre: 200, poidsTotalG: 9768 }],
  distributions: [],
  traitements: [], recoltes: [], depenses: [],
  especes: [{ id: 'cl', nom: 'Clarias' }],
});
const paliers: PalierRationnement[] = [
  { id: 'a', especeId: 'cl', poidsMin: 0, poidsMax: 50, tauxPct: 3, frequenceRepas: 3 },
  { id: 'b', especeId: 'cl', poidsMin: 50, poidsMax: 500, tauxPct: 2, frequenceRepas: 2 },
];

// Pêche 2 en cours de saisie : 60 g, 32 jours après la pêche 1.
const auP2 = cycleAuJourDeLaPesee(cycle(), { id: 'p2', numero: 2, dateOperation: P2 }, [
  { id: 'e2', lotId: 'l', numero: 1, nombre: 100, poidsTotalG: 6000 },
]);
const r2 = rationDuCycle(calculerIndicateurs(auP2), paliers);
// La même pesée, rejouée avant ses échantillons : poids de la pêche 1.
const r1 = rationDuCycle(calculerIndicateurs(cycle()), paliers);

// Ration de 5,86 kg/j fixée à la pêche 1, pêche 2 trente-deux jours après.
const avecRation = cycle();
avecRation.pesees.push({ id: 'p2', numero: 2, dateOperation: P2 });
avecRation.distributions = [ration(5.86, P1, { prixKgApplique: 1000 }), ration(7.8, P2, { id: 'd2', prixKgApplique: 1000 })];
const i = calculerIndicateurs(avecRation, { aujourdhui: '2022-11-30' });

const attendu: Array<[string, unknown, unknown]> = [
  // --- Période d'une ration ---
  ['jusqu’à la pêche suivante (32 j)', kg(ration(2), { pesees }), 64],
  ['pêche suivante exclue : nouvelle ration', quantiteDistribuee(ration(2), { pesees }).jours, 32],
  ['ration ouverte : jusqu’à aujourd’hui inclus', kg(ration(2, P2), { pesees, aujourdhui: '2022-11-30' }), 20],
  ['ration ouverte sans date du jour', kg(ration(2, P2), { pesees }), 0],
  ['ration ouverte signalée en cours', quantiteDistribuee(ration(2, P2), { pesees, aujourdhui: '2022-11-30' }).enCours, true],
  ['ration close par la pêche : plus en cours', quantiteDistribuee(ration(2), { pesees }).enCours, false],
  ['clôture du cycle avant la pêche suivante', kg(ration(2), { pesees, dateCloture: '2022-11-01' }), 24],
  ['date de fin saisie, dernier jour inclus', kg(ration(2, P1, { dateFin: '2022-10-29' }), { pesees }), 20],
  ['jamais au-delà d’aujourd’hui', kg(ration(2, P1, { dateFin: '2022-12-31' }), { pesees: [], aujourdhui: '2022-10-21' }), 4],
  ['quantité mesurée : elle prime', kg(ration(2, P1, { quantiteTotaleKg: 50 }), { pesees }), 50],
  ['ni ration ni quantité', kg({ id: 'x', alimentId: 'a', dateDebut: P1 }, { pesees }), 0],

  // --- Ration fixée sur la pesée du jour, pas sur la précédente ---
  ['biomasse à la pêche 2 : 3 900 × 60 g', r2?.biomasseKg, 234],
  ['palier du nouveau poids (60 g → 2 %)', r2?.conseil?.tauxPct, 2],
  ['ration conseillée à la pêche 2', r2?.conseil?.rationKg, 4.68],
  ['avant les échantillons : poids de la pêche 1', r1?.poidsMoyenG, 48.84],
  ['mortalité postérieure ignorée à la pêche 1', cycleAuJourDeLaPesee(cycle(), { id: 'p1', numero: 1, dateOperation: P1 }, []).mortalites.length, 0],

  // --- Dans les indicateurs ---
  ['aliment du cycle : 5,86 × 32 + 7,8 × 10', i.alimentation.alimentDistribueKg, 265.52],
  ['coût de l’aliment', i.economie.charges.aliments, 265520],
  ['ration en cours', i.alimentation.rationEnCoursKgJour, 7.8],
];

let echecs = 0;
for (const [nom, obtenu, voulu] of attendu) {
  const ok = obtenu === voulu;
  if (!ok) echecs++;
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${nom.padEnd(46)} obtenu=${obtenu}  attendu=${voulu}`);
}

console.log(echecs === 0 ? '\nALIMENTATION : TOUS LES CONTROLES PASSENT' : `\nALIMENTATION : ${echecs} CONTROLE(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
