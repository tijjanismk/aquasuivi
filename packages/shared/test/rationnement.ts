/**
 * Choix du palier de ration. Un mauvais palier, c'est de l'aliment payé qui
 * pollue le bassin (suralimentation) ou un cycle qui traîne (sous-alimentation).
 */
import { palierApplicable, ration, rationConseillee } from '../src/rationnement.js';
import type { PalierRationnement } from '../src/types.js';

const TILAPIA = 'esp_tilapia';
const CLARIAS = 'esp_clarias';

const paliers: PalierRationnement[] = [
  { id: 't0', especeId: TILAPIA, poidsMin: 0, poidsMax: 10, tauxPct: 10, frequenceRepas: 5 },
  // Thermiques déclarés AVANT le générique : l'ordre ne doit pas décider
  { id: 't1_froid', especeId: TILAPIA, poidsMin: 10, poidsMax: 50, temperatureMax: 22, tauxPct: 3, frequenceRepas: 2 },
  { id: 't1_chaud', especeId: TILAPIA, poidsMin: 10, poidsMax: 50, temperatureMin: 30, tauxPct: 4, frequenceRepas: 3 },
  { id: 't1', especeId: TILAPIA, poidsMin: 10, poidsMax: 50, tauxPct: 5, frequenceRepas: 4, source: 'FAO' },
  { id: 'c0', especeId: CLARIAS, poidsMin: 0, poidsMax: 1000, tauxPct: 7, frequenceRepas: 3 },
  // Espèce sans palier générique : uniquement thermique
  { id: 'x_chaud', especeId: 'esp_x', poidsMin: 0, poidsMax: 100, temperatureMin: 25, tauxPct: 6, frequenceRepas: 3 },
];

const id = (poids: number, temp?: number | null, espece = TILAPIA) =>
  palierApplicable(paliers, espece, poids, temp)?.id ?? null;

const conseil = rationConseillee(paliers, TILAPIA, 30, 200, 26);

const attendu: Array<[string, unknown, unknown]> = [
  // Bornes : poidsMin inclus, poidsMax exclu
  ['0 g → premier palier', id(0), 't0'],
  ['9,99 g → premier palier', id(9.99), 't0'],
  ['10 g → second palier', id(10), 't1'],
  ['49,99 g → second palier', id(49.99), 't1'],
  ['50 g → aucun palier', id(50), null],

  // Espèce
  ['autre espèce', id(30, null, CLARIAS), 'c0'],
  ['espèce inconnue', id(30, null, 'esp_absente'), null],

  // Température
  ['sans température → générique', id(30), 't1'],
  ['null → générique', id(30, null), 't1'],
  ['20 °C → palier froid', id(30, 20), 't1_froid'],
  ['22 °C (max exclu) → générique', id(30, 22), 't1'],
  ['26 °C → générique', id(30, 26), 't1'],
  ['30 °C (min inclus) → chaud', id(30, 30), 't1_chaud'],
  ['0 °C compte (≠ absent)', id(30, 0), 't1_froid'],

  // Pas de générique : on retombe sur le premier candidat
  ['thermique seul, 20 °C', id(50, 20, 'esp_x'), 'x_chaud'],
  ['thermique seul, sans temp.', id(50, null, 'esp_x'), 'x_chaud'],

  // Ration
  ['ration 200 kg à 2,5 %', ration(200, 2.5), 5],
  ['ration arrondie à 10 g', ration(123.456, 3), 3.7],
  ['conseil : taux', conseil?.tauxPct, 5],
  ['conseil : ration kg', conseil?.rationKg, 10],
  ['conseil : repas', conseil?.frequenceRepas, 4],
  ['conseil : source', conseil?.source, 'FAO'],
  ['conseil hors palier', rationConseillee(paliers, TILAPIA, 500, 200), null],
];

let echecs = 0;
for (const [nom, obtenu, voulu] of attendu) {
  const ok = obtenu === voulu;
  if (!ok) echecs++;
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${nom.padEnd(30)} obtenu=${obtenu}  attendu=${voulu}`);
}

console.log(echecs === 0 ? '\nRATIONNEMENT : TOUS LES CONTROLES PASSENT' : `\nRATIONNEMENT : ${echecs} CONTROLE(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
