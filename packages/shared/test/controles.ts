/**
 * Contrôles de saisie. Les mêmes fonctions tourneront dans la PWA hors ligne :
 * ce qui est refusé ici l'est partout.
 */
import {
  controlerCycle,
  controlerDepense,
  controlerDistribution,
  controlerEchantillon,
  controlerInfrastructure,
  controlerLot,
  controlerMesureEau,
  controlerMortalite,
  controlerPesee,
  controlerRecolte,
  type ContexteCycle,
  type Violation,
} from '../src/controles.js';

const AUJ = '2026-09-26';
const CYCLE = { dateMiseEnCharge: '2026-03-01', dateCloture: null };
const CLOS = { dateMiseEnCharge: '2026-03-01', dateCloture: '2026-08-31' };
const CTX: ContexteCycle = { aujourdhui: AUJ, infrastructureActive: true, creation: true };

/** Codes renvoyés, triés et joints : une comparaison stricte reste lisible. */
const codes = (v: Violation[]) => v.map((x) => x.code).sort().join(',') || 'aucun';

const attendu: Array<[string, unknown, unknown]> = [
  // --- Cycle ---
  ['cycle valide', codes(controlerCycle({ dateMiseEnCharge: '2026-03-01', statut: 'EN_COURS' }, CTX)), 'aucun'],
  ['cycle bouclé valide', codes(controlerCycle({ dateMiseEnCharge: '2026-03-01', dateCloture: '2026-08-31', statut: 'BOUCLE' }, CTX)), 'aucun'],
  ['sans mise en charge', codes(controlerCycle({}, CTX)), 'CHAMP_REQUIS'],
  ['mise en charge future', codes(controlerCycle({ dateMiseEnCharge: '2026-10-15' }, CTX)), 'DATE_FUTURE'],
  ['demain toléré (fuseaux)', codes(controlerCycle({ dateMiseEnCharge: '2026-09-27' }, CTX)), 'aucun'],
  ['clôture avant charge', codes(controlerCycle({ dateMiseEnCharge: '2026-03-01', dateCloture: '2026-02-01', statut: 'BOUCLE' }, CTX)), 'CYCLE_CLOTURE_AVANT_CHARGE'],
  ['bouclé sans date', codes(controlerCycle({ dateMiseEnCharge: '2026-03-01', statut: 'BOUCLE' }, CTX)), 'CLOTURE_SANS_DATE'],
  ['date de clôture mais en cours', codes(controlerCycle({ dateMiseEnCharge: '2026-03-01', dateCloture: '2026-08-31', statut: 'EN_COURS' }, CTX)), 'DATE_CLOTURE_SUR_CYCLE_OUVERT'],
  ['second cycle ouvert (hors ligne)', codes(controlerCycle({ dateMiseEnCharge: '2026-03-01' }, { ...CTX, autreCycleOuvert: true })), 'CYCLE_DEJA_OUVERT'],
  ['cycle clos saisi à côté d’un ouvert', codes(controlerCycle({ dateMiseEnCharge: '2025-03-01', dateCloture: '2025-08-01', statut: 'BOUCLE' }, { ...CTX, autreCycleOuvert: true })), 'aucun'],
  ['bassin désactivé', codes(controlerCycle({ dateMiseEnCharge: '2026-03-01' }, { ...CTX, infrastructureActive: false })), 'INFRASTRUCTURE_INACTIVE'],
  ['bassin désactivé, cycle ancien retouché', codes(controlerCycle({ dateMiseEnCharge: '2026-03-01' }, { ...CTX, infrastructureActive: false, creation: false })), 'aucun'],
  ['chevauche le précédent', codes(controlerCycle({ dateMiseEnCharge: '2026-03-01' }, { ...CTX, cloturePrecedente: '2026-03-10' })), 'CHEVAUCHEMENT_CYCLES'],
  ['commence le jour de la clôture précédente', codes(controlerCycle({ dateMiseEnCharge: '2026-03-10' }, { ...CTX, cloturePrecedente: '2026-03-10' })), 'aucun'],
  ['chevauche le suivant', codes(controlerCycle({ dateMiseEnCharge: '2026-03-01', dateCloture: '2026-09-01', statut: 'BOUCLE' }, { ...CTX, miseEnChargeSuivante: '2026-08-15' })), 'CHEVAUCHEMENT_CYCLES'],
  ['opération avant la nouvelle charge', codes(controlerCycle({ dateMiseEnCharge: '2026-03-01' }, { ...CTX, premiereOperation: '2026-02-20' })), 'OPERATIONS_AVANT_MISE_EN_CHARGE'],
  ['opération après la clôture', codes(controlerCycle({ dateMiseEnCharge: '2026-03-01', dateCloture: '2026-08-31', statut: 'BOUCLE' }, { ...CTX, derniereOperation: '2026-09-05' })), 'OPERATIONS_APRES_CLOTURE'],

  // --- Dates des opérations ---
  ['pesée dans le cycle', codes(controlerPesee({ dateOperation: '2026-04-01' }, CYCLE, AUJ)), 'aucun'],
  ['pesée avant la charge', codes(controlerPesee({ dateOperation: '2026-02-28' }, CYCLE, AUJ)), 'DATE_AVANT_MISE_EN_CHARGE'],
  ['pesée le jour de la charge', codes(controlerPesee({ dateOperation: '2026-03-01' }, CYCLE, AUJ)), 'aucun'],
  ['pesée après clôture', codes(controlerPesee({ dateOperation: '2026-09-01' }, CLOS, AUJ)), 'DATE_APRES_CLOTURE'],
  ['pesée le jour de la clôture', codes(controlerPesee({ dateOperation: '2026-08-31' }, CLOS, AUJ)), 'aucun'],
  ['pesée future', codes(controlerPesee({ dateOperation: '2026-12-01' }, CYCLE, AUJ)), 'DATE_FUTURE'],
  ['taux de ration 12 %', codes(controlerPesee({ dateOperation: '2026-04-01', tauxRationPct: 12 }, CYCLE, AUJ)), 'VALEUR_HORS_BORNES'],
  ['dépense avant la charge (préparation)', codes(controlerDepense({ montant: 15000, dateOperation: '2026-02-15' }, CYCLE, AUJ)), 'aucun'],
  ['dépense après clôture', codes(controlerDepense({ montant: 15000, dateOperation: '2026-09-15' }, CLOS, AUJ)), 'DATE_APRES_CLOTURE'],
  ['dépense nulle', codes(controlerDepense({ montant: 0, dateOperation: '2026-04-01' }, CYCLE, AUJ)), 'VALEUR_NON_POSITIVE'],

  // --- Lot ---
  ['lot valide', codes(controlerLot({ nombre: 1000, poidsMoyenG: 5, coutUnitaire: 110, dateMiseEnCharge: '2026-03-01' }, CYCLE, AUJ)), 'aucun'],
  ['lot vide', codes(controlerLot({ nombre: 0, poidsMoyenG: 5, dateMiseEnCharge: '2026-03-01' }, CYCLE, AUJ)), 'VALEUR_NON_POSITIVE'],
  ['lot coût négatif', codes(controlerLot({ nombre: 10, poidsMoyenG: 5, coutUnitaire: -1, dateMiseEnCharge: '2026-03-01' }, CYCLE, AUJ)), 'VALEUR_NEGATIVE'],

  // --- Mortalité : pas plus de morts que de poissons ---
  ...(() => {
    const ctx = { lot: { nombre: 1000, dateMiseEnCharge: '2026-03-01' }, autres: { nombre: 950, remplacement: 0 }, recoltes: 0 };
    return [
      ['mortalité dans l’effectif', codes(controlerMortalite({ nombre: 50, dateConstat: '2026-04-01' }, ctx, CYCLE, AUJ)), 'aucun'],
      ['mortalité au-delà de l’effectif', codes(controlerMortalite({ nombre: 51, dateConstat: '2026-04-01' }, ctx, CYCLE, AUJ)), 'MORTALITE_SUPERIEURE_EFFECTIF'],
      ['remplacement rouvre de la place', codes(controlerMortalite({ nombre: 51, dateConstat: '2026-04-01' }, { ...ctx, autres: { nombre: 950, remplacement: 10 } }, CYCLE, AUJ)), 'aucun'],
      ['récoltes déduites', codes(controlerMortalite({ nombre: 50, dateConstat: '2026-04-01' }, { ...ctx, recoltes: 1 }, CYCLE, AUJ)), 'MORTALITE_SUPERIEURE_EFFECTIF'],
      ['mortalité avant le lot', codes(controlerMortalite({ nombre: 1, dateConstat: '2026-03-05' }, { ...ctx, lot: { nombre: 1000, dateMiseEnCharge: '2026-03-10' } }, CYCLE, AUJ)), 'MORTALITE_AVANT_LOT'],
    ] as Array<[string, unknown, unknown]>;
  })(),

  // --- Échantillon ---
  ['échantillon valide', codes(controlerEchantillon({ nombre: 12, poidsTotalG: 455 })), 'aucun'],
  ['échantillon sans poids', codes(controlerEchantillon({ nombre: 12 })), 'CHAMP_REQUIS'],
  ['kilos saisis comme grammes', codes(controlerEchantillon({ nombre: 1, poidsTotalG: 350000 })), 'POIDS_INVRAISEMBLABLE'],

  // --- Distribution ---
  ['distribution valide', codes(controlerDistribution({ dateDebut: '2026-03-01', dateFin: '2026-03-31', quantiteTotaleKg: 22 }, CYCLE, AUJ)), 'aucun'],
  ['période inversée', codes(controlerDistribution({ dateDebut: '2026-03-31', dateFin: '2026-03-01', quantiteTotaleKg: 22 }, CYCLE, AUJ)), 'PERIODE_INVERSEE'],
  ['quantité nulle', codes(controlerDistribution({ dateDebut: '2026-03-01', quantiteTotaleKg: 0 }, CYCLE, AUJ)), 'VALEUR_NON_POSITIVE'],
  ['ration seule, sans quantité (D29)', codes(controlerDistribution({ dateDebut: '2026-03-01', rationKgJour: 1.5 }, CYCLE, AUJ)), 'aucun'],
  ['ni ration ni quantité', codes(controlerDistribution({ dateDebut: '2026-03-01' }, CYCLE, AUJ)), 'CHAMP_REQUIS'],

  // --- Récolte ---
  ['récolte valide', codes(controlerRecolte({ dateOperation: '2026-08-01', poidsKg: 120, prixKg: 1750 }, {}, CYCLE, AUJ)), 'aucun'],
  ['récolte sans poids', codes(controlerRecolte({ dateOperation: '2026-08-01' }, {}, CYCLE, AUJ)), 'CHAMP_REQUIS'],
  ['espèce autre que celle du lot', codes(controlerRecolte({ dateOperation: '2026-08-01', poidsKg: 1, especeId: 'clarias' }, { especeLot: 'tilapia' }, CYCLE, AUJ)), 'ESPECE_DIFFERENTE_DU_LOT'],
  ['plus de poissons que l’effectif', codes(controlerRecolte({ dateOperation: '2026-08-01', poidsKg: 100, nombre: 300 }, { effectifRestant: 250 }, CYCLE, AUJ)), 'RECOLTE_SUPERIEURE_EFFECTIF'],
  ['effectif inconnu : pas de blocage', codes(controlerRecolte({ dateOperation: '2026-08-01', poidsKg: 100, nombre: 300 }, { effectifRestant: null }, CYCLE, AUJ)), 'aucun'],

  // --- Eau et infrastructure ---
  ['mesure valide', codes(controlerMesureEau({ dateMesure: '2026-04-01', heure: '06:30', temperature: 27, ph: 7.2, oxygeneDissous: 4.5 }, CYCLE, AUJ)), 'aucun'],
  ['pH 72 (virgule oubliée)', codes(controlerMesureEau({ dateMesure: '2026-04-01', ph: 72 }, CYCLE, AUJ)), 'VALEUR_HORS_BORNES'],
  ['heure 6h30', codes(controlerMesureEau({ dateMesure: '2026-04-01', heure: '6h30' }, CYCLE, AUJ)), 'HEURE_INVALIDE'],
  ['mesure hors cycle, bassin vide', codes(controlerMesureEau({ dateMesure: '2026-01-01' }, null, AUJ)), 'aucun'],
  ['bassin valide', codes(controlerInfrastructure({ longueur: 20, largeur: 5, profondeur: 1.2, niveauRemplissage: 80 })), 'aucun'],
  ['profondeur nulle', codes(controlerInfrastructure({ profondeur: 0 })), 'VALEUR_NON_POSITIVE'],
  ['remplissage 120 %', codes(controlerInfrastructure({ niveauRemplissage: 120 })), 'VALEUR_HORS_BORNES'],
];

let echecs = 0;
for (const [nom, obtenu, voulu] of attendu) {
  const ok = obtenu === voulu;
  if (!ok) echecs++;
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${nom.padEnd(42)} obtenu=${obtenu}  attendu=${voulu}`);
}

console.log(echecs === 0 ? '\nCONTROLES : TOUS LES CONTROLES PASSENT' : `\nCONTROLES : ${echecs} CONTROLE(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
