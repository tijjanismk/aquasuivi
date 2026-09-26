/**
 * Surface et volume en eau. L'API les stocke à l'écriture d'une
 * infrastructure : une erreur ici fausse densité et rendement de tous les
 * cycles du bassin.
 */
import { dimensionsCalculees, superficie, volume } from '../src/geometrie.js';

const attendu: Array<[string, unknown, unknown]> = [
  // Rectangulaire
  ['rect. superficie', superficie({ forme: 'RECTANGULAIRE', longueur: 20, largeur: 5 }), 100],
  ['rect. volume plein', volume({ forme: 'RECTANGULAIRE', longueur: 20, largeur: 5, profondeur: 1 }), 100],
  ['rect. volume à 80 %', volume({ forme: 'RECTANGULAIRE', longueur: 20, largeur: 5, profondeur: 1, niveauRemplissage: 80 }), 80],
  ['rect. volume vide', volume({ forme: 'RECTANGULAIRE', longueur: 20, largeur: 5, profondeur: 1, niveauRemplissage: 0 }), 0],

  // Circulaire : π × 2² = 12,566…
  ['circ. superficie', superficie({ forme: 'CIRCULAIRE', diametre: 4 }), 12.57],
  // Volume calculé sur la superficie arrondie, celle qui est stockée :
  // 12,57 × 1,2 × 0,8 = 12,07 (et non 12,06 depuis π exact).
  ['circ. volume à 80 %', volume({ forme: 'CIRCULAIRE', diametre: 4, profondeur: 1.2, niveauRemplissage: 80 }), 12.07],
  ['circ. ignore long./larg.', superficie({ forme: 'CIRCULAIRE', longueur: 10, largeur: 10 }), null],

  // Dimensions manquantes → null, jamais 0 ni NaN
  ['rect. sans largeur', superficie({ forme: 'RECTANGULAIRE', longueur: 20 }), null],
  ['rect. largeur nulle', superficie({ forme: 'RECTANGULAIRE', longueur: 20, largeur: null }), null],
  ['volume sans surface', volume({ forme: 'RECTANGULAIRE', longueur: 20, profondeur: 1 }), null],
  ['volume sans profondeur', volume({ forme: 'RECTANGULAIRE', longueur: 20, largeur: 5 }), null],
  ['circ. sans diamètre', volume({ forme: 'CIRCULAIRE', profondeur: 1 }), null],

  // Forme stockée : les deux valeurs d'un coup
  ['dimensionsCalculees', JSON.stringify(dimensionsCalculees({ forme: 'RECTANGULAIRE', longueur: 8, largeur: 2.5, profondeur: 1.5, niveauRemplissage: 80 })), JSON.stringify({ superficie: 20, volume: 24 })],
  ['dimensionsCalculees partiel', JSON.stringify(dimensionsCalculees({ forme: 'RECTANGULAIRE', longueur: 8, largeur: 2.5 })), JSON.stringify({ superficie: 20, volume: null })],
];

let echecs = 0;
for (const [nom, obtenu, voulu] of attendu) {
  const ok = obtenu === voulu;
  if (!ok) echecs++;
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${nom.padEnd(28)} obtenu=${obtenu}  attendu=${voulu}`);
}

console.log(echecs === 0 ? '\nGEOMETRIE : TOUS LES CONTROLES PASSENT' : `\nGEOMETRIE : ${echecs} CONTROLE(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
