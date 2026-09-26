/**
 * Moteur d'alertes. Chaque règle est déclenchée puis évitée, sur un bassin
 * de 100 m² de tilapia dont on fait varier une seule chose à la fois.
 */
import { calculerAlertes, SEUIL_HETEROGENEITE_DEFAUT } from '../src/alertes.js';
import type { CycleComplet } from '../src/types.js';

const TILAPIA = {
  id: 'til', nom: 'Tilapia du Nil', codeFao: 'TLN',
  gainJournalierRef: 2.1, indiceConsommationRef: 1.6, tauxSurvieRef: 0.9,
  temperatureMin: 12, temperatureOptMin: 25, temperatureOptMax: 32, temperatureMax: 40,
  oxygeneMin: 3, densiteMaxM2: 25, densiteMaxM3: 500,
};

/// Cycle sain : 1 000 alevins de 5 g, pesés à 100 g après 45 jours.
function cycle(modif: (d: CycleComplet) => void = () => undefined): CycleComplet {
  const d: CycleComplet = {
    cycle: { id: 'c', numero: 1, dateMiseEnCharge: '2026-01-01', dateCloture: null, statut: 'EN_COURS', especeId: 'til' },
    infrastructure: { id: 'b', nom: 'B1', mesureBase: 'SUPERFICIE', forme: 'RECTANGULAIRE', superficie: 100, volume: null },
    especes: [{ ...TILAPIA }],
    lots: [{ id: 'l', especeId: 'til', nombre: 1000, poidsMoyenG: 5, coutUnitaire: 100, dateMiseEnCharge: '2026-01-01' }],
    mortalites: [{ id: 'm', lotId: 'l', dateConstat: '2026-01-10', nombre: 20, remplacement: 0 }],
    pesees: [{ id: 'p', numero: 1, dateOperation: '2026-02-15', tauxRationPct: 3 }],
    echantillons: [
      { id: 'e1', peseeId: 'p', lotId: 'l', numero: 1, nombre: 10, poidsTotalG: 1000 },
      { id: 'e2', peseeId: 'p', lotId: 'l', numero: 2, nombre: 10, poidsTotalG: 1020 },
    ],
    distributions: [{ id: 'd', alimentId: 'a', dateDebut: '2026-01-01', quantiteTotaleKg: 130, prixKgApplique: 500 }],
    traitements: [],
    recoltes: [],
    depenses: [],
  };
  modif(d);
  return d;
}

const AUJ = '2026-02-20';
const codes = (d: CycleComplet, mesures = [] as Parameters<typeof calculerAlertes>[1]['mesures'], auj = AUJ) =>
  calculerAlertes(d, { aujourdhui: auj, mesures }).map((a) => `${a.code}:${a.niveau}`).sort().join(',') || 'aucune';

const attendu: Array<[string, unknown, unknown]> = [
  ['cycle sain', codes(cycle()), 'aucune'],

  // Densité : 25 poissons/m² maximum
  ['2 600 poissons sur 100 m²', codes(cycle((d) => { d.lots[0]!.nombre = 2620; })), 'DENSITE_EXCESSIVE:attention'],
  ['3 500 poissons : critique', codes(cycle((d) => { d.lots[0]!.nombre = 3520; })), 'DENSITE_EXCESSIVE:critique'],
  ['bac en m³', codes(cycle((d) => { d.lots[0]!.nombre = 2620; d.infrastructure.mesureBase = 'VOLUME'; d.infrastructure.volume = 4; })), 'DENSITE_EXCESSIVE:critique'],
  ['cycle bouclé : plus de densité', codes(cycle((d) => { d.lots[0]!.nombre = 2620; d.cycle.dateCloture = '2026-02-15'; d.cycle.statut = 'BOUCLE'; })), 'aucune'],

  // Eau : le dernier relevé fait foi
  ['oxygène à 2 mg/L', codes(cycle(), [{ dateMesure: '2026-02-19', heure: '06:00', oxygeneDissous: 2 }]), 'OXYGENE_BAS:critique'],
  ['oxygène remonté ensuite', codes(cycle(), [{ dateMesure: '2026-02-18', oxygeneDissous: 2 }, { dateMesure: '2026-02-19', oxygeneDissous: 5 }]), 'aucune'],
  ['eau à 22 °C', codes(cycle(), [{ dateMesure: '2026-02-19', temperature: 22 }]), 'TEMPERATURE_HORS_OPTIMUM:attention'],
  ['eau à 42 °C', codes(cycle(), [{ dateMesure: '2026-02-19', temperature: 42 }]), 'TEMPERATURE_LETALE:critique'],
  ['pH 5,8', codes(cycle(), [{ dateMesure: '2026-02-19', ph: 5.8 }]), 'PH_HORS_PLAGE:attention'],

  // Suivi et performances
  ['pesée vieille de 35 jours', codes(cycle(), [], '2026-03-22'), 'PESEE_EN_RETARD:info'],
  ['croissance sous la référence', codes(cycle((d) => { d.echantillons.forEach((e) => { e.poidsTotalG = 500; }); d.distributions[0]!.quantiteTotaleKg = 60; })), 'CROISSANCE_LENTE:attention'],
  ['lot hétérogène', codes(cycle((d) => { d.echantillons[0]!.poidsTotalG = 600; d.echantillons[1]!.poidsTotalG = 1400; })), 'LOT_HETEROGENE:attention'],
  ['seuil propre à l’espèce (60 %)', codes(cycle((d) => { d.echantillons[0]!.poidsTotalG = 600; d.echantillons[1]!.poidsTotalG = 1400; d.especes[0]!.seuilHeterogeneitePct = 60; })), 'aucune'],
  ['survie à 70 % (référence 90 %)', codes(cycle((d) => { d.mortalites[0]!.nombre = 300; d.distributions[0]!.quantiteTotaleKg = 90; })), 'MORTALITE_ELEVEE:attention'],
  ['aliment mal valorisé', codes(cycle((d) => { d.distributions[0]!.quantiteTotaleKg = 250; })), 'ALIMENT_MAL_VALORISE:attention'],

  // Sanitaire
  ['traitement en cours', codes(cycle((d) => { d.traitements = [{ id: 't', dateOperation: '2026-02-10', finDelaiAttente: '2026-03-10' }]; })), 'TRAITEMENT_EN_COURS:info'],
  // La récolte allonge le cycle et change la production : d'autres alertes
  // peuvent légitimement suivre, seule compte ici l'alerte sanitaire.
  ['récolte dans le délai', codes(cycle((d) => {
    d.traitements = [{ id: 't', dateOperation: '2026-02-10', finDelaiAttente: '2026-03-10' }];
    d.recoltes = [{ id: 'r', dateOperation: '2026-02-19', type: 'VENTE', poidsKg: 10, prixKg: 1500 }];
  })).includes('RECOLTE_EN_DELAI_ATTENTE:critique'), true],

  ['critique en premier', calculerAlertes(cycle((d) => { d.lots[0]!.nombre = 3520; }), { aujourdhui: '2026-03-22', mesures: [] })[0]?.niveau, 'critique'],
  ['seuil par défaut', SEUIL_HETEROGENEITE_DEFAUT, 25],
];

let echecs = 0;
for (const [nom, obtenu, voulu] of attendu) {
  const ok = obtenu === voulu;
  if (!ok) echecs++;
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${nom.padEnd(40)} obtenu=${obtenu}  attendu=${voulu}`);
}
console.log(echecs === 0 ? '\nALERTES : TOUS LES CONTROLES PASSENT' : `\nALERTES : ${echecs} CONTROLE(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
