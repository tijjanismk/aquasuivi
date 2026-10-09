/**
 * Simulation (étape 9). Critère de fin : une simulation et un cycle réel
 * passent par le même code. On le vérifie en rejouant le cycle projeté dans
 * `calculerIndicateurs`, puis on contrôle les ordres de grandeur sur un étang
 * de tilapia de 100 m², comparable au cas B4.
 */
import { simuler, ErreurSimulation, type EspeceSimulation, type TypeSimulation } from '../src/simulation.js';
import { calculerIndicateurs } from '../src/indicateurs.js';
import { lireNombre } from '../src/nombres.js';

const TILAPIA: EspeceSimulation = {
  id: 'til', nom: 'Tilapia du Nil', gainJournalierRef: 2.1, indiceConsommationRef: 1.6, tauxSurvieRef: 0.9,
  poidsMarcheMin: 180, poidsMarcheMax: 500, dureeCycleRef: 180, densiteMaxM2: 25, densiteMaxM3: 500,
};
const ETANG: TypeSimulation = { id: 'etang', nom: 'Étang en terre', forme: 'RECTANGULAIRE', mesureBase: 'SUPERFICIE' };
const BAC: TypeSimulation = { id: 'bac', nom: 'Bac hors-sol', forme: 'CIRCULAIRE', mesureBase: 'VOLUME' };

const base = {
  capital: 500_000, especeId: 'til', typeInfrastructureId: 'etang', taille: 100,
  densite: 10, poidsInitialG: 5, poidsCibleG: 350,
  prixAlevin: 110, prixAlimentKg: 500, prixVenteKg: 1750, autresCharges: 115_000,
  dateDebut: '2026-01-01',
};

const s = simuler(base, [TILAPIA], [ETANG, BAC]);
const rejoue = calculerIndicateurs(s.cycleProjete);
const erreur = (f: () => unknown) => {
  try { f(); return 'aucune'; } catch (e) { return e instanceof ErreurSimulation ? e.message : 'autre'; }
};

const attendu: Array<[string, unknown, unknown]> = [
  // Saisie à la française (« 12,5 », « 500 000 ») : NaN avec Number().
  ['virgule décimale', lireNombre('12,5'), 12.5],
  ['espace des milliers', lireNombre('500 000'), 500000],
  ['espace insécable d’Intl', lireNombre('1 750,50'), 1750.5],
  ['vide', lireNombre('  '), null],
  ['illisible', lireNombre('douze'), null],
  // Même code : le cycle projeté rejoué donne exactement les mêmes indicateurs.
  ['même code que les cycles réels', JSON.stringify(rejoue), JSON.stringify(s.indicateurs)],

  ['1 000 alevins (10/m² × 100 m²)', s.projection.effectifInitial, 1000],
  ['900 survivants (90 %)', s.projection.effectifFinal, 900],
  ['durée : (350 − 5) / 2,1 → 165 j', s.projection.dureeJours, 165],
  ['production : 900 × 350 g', s.projection.productionKg, 315],
  ['aliment : 1,6 × (315 − 5)', s.projection.alimentKg, 496],
  ['poids final mesuré à la récolte', s.indicateurs.zootechnie.poidsMoyenFinalG, 350],
  ['charges alevins', s.indicateurs.economie.charges.alevins, 110_000],
  ['charges aliment', s.indicateurs.economie.charges.aliments, 248_000],
  ['besoin de financement', s.financement.besoin, 473_000],
  ['capital suffisant', s.financement.suffisant, true],
  ['résultat : 315 × 1 750 − 473 000', s.rentabilite.resultat, 78_250],
  ['seuil = prix de revient', s.rentabilite.seuilPrixVenteKg, s.rentabilite.prixRevientKg],
  ['seuil de production', s.rentabilite.seuilProductionKg, 270.3],
  ['taille finançable avec 500 000 F', s.financement.tailleFinancable, 105.7],
  ['2,21 cycles par an', s.projection.cyclesParAn, 2.21],

  // Valeurs par défaut tirées de l'espèce
  ['densité par défaut : 80 % de 25', simuler({ ...base, densite: null }, [TILAPIA], [ETANG]).projection.densite, 20],
  ['poids de vente par défaut : milieu 180–500', simuler({ ...base, poidsCibleG: null }, [TILAPIA], [ETANG]).projection.poidsCibleG, 340],
  ['bac : densité au m³ (80 % de 500)', simuler({ ...base, typeInfrastructureId: 'bac', densite: null, taille: 2 }, [TILAPIA], [ETANG, BAC]).projection.effectifInitial, 800],
  ['capital insuffisant', simuler({ ...base, capital: 100_000 }, [TILAPIA], [ETANG]).financement.suffisant, false],
  ['hypothèses expliquées', simuler({ ...base, densite: null, poidsCibleG: null }, [TILAPIA], [ETANG]).hypotheses.length >= 3, true],

  // Refus lisibles
  ['espèce inconnue', erreur(() => simuler({ ...base, especeId: 'x' }, [TILAPIA], [ETANG])), 'Espèce inconnue.'],
  ['taille nulle', erreur(() => simuler({ ...base, taille: 0 }, [TILAPIA], [ETANG])), 'La taille du bassin doit être positive.'],
  ['poids de vente trop bas', erreur(() => simuler({ ...base, poidsCibleG: 4 }, [TILAPIA], [ETANG])), 'Le poids de vente doit dépasser le poids des alevins.'],
];

let echecs = 0;
for (const [nom, obtenu, voulu] of attendu) {
  const ok = obtenu === voulu;
  if (!ok) echecs++;
  const court = (v: unknown) => String(v).slice(0, 60);
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${nom.padEnd(44)} obtenu=${court(obtenu)}  attendu=${court(voulu)}`);
}
console.log(echecs === 0 ? '\nSIMULATION : TOUS LES CONTROLES PASSENT' : `\nSIMULATION : ${echecs} CONTROLE(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
