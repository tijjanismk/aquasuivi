/// Référentiels administrables (D10 : rien en dur, tout en base).

import type { Ressource } from './description';
export type { Champ, Ressource, TypeChamp } from './description';

const FORMES = ['RECTANGULAIRE', 'CIRCULAIRE', 'IRREGULIERE'] as const;
const MESURES = ['SUPERFICIE', 'VOLUME'] as const;
const MILIEUX_FAO = ['FRESHWATER', 'BRACKISHWATER', 'MARICULTURE'] as const;
const SYSTEMES_FAO = [
  'PONDS_TANKS',
  'CAGES',
  'PENS_ENCLOSURES',
  'RACEWAYS_SILOS',
  'BARRAGES',
  'RICE_FISH',
  'RAFTS_ROPES_STAKES',
  'HATCHERIES_NURSERIES',
] as const;

export const REFERENTIELS: Ressource[] = [
  {
    nom: 'referentiels/especes',
    chemin: 'especes',
    libelle: 'Espèces',
    libelleSingulier: 'espèce',
    description:
      "Références zootechniques par espèce. Elles servent d'étalon aux alertes, jamais de contrainte à la saisie.",
    triDefaut: 'nom',
    champs: [
      { nom: 'nom', libelle: 'Nom', type: 'texte', requis: true, enListe: true },
      {
        nom: 'codeFao',
        libelle: 'Code FAO',
        type: 'texte',
        enListe: true,
        aide: "Code ASFIS 3 lettres. Laisser vide plutôt que deviner : un code faux agrège la production nationale sous la mauvaise espèce.",
      },
      { nom: 'nomScientifique', libelle: 'Nom scientifique', type: 'texte' },
      { nom: 'nomLocal', libelle: 'Nom local', type: 'texte', aide: 'Bambara ou autre langue locale.' },
      { nom: 'famille', libelle: 'Famille', type: 'texte' },
      { nom: 'temperatureMin', libelle: 'Température min (°C)', type: 'nombre' },
      { nom: 'temperatureOptMin', libelle: 'Température optimale min (°C)', type: 'nombre', enListe: true },
      { nom: 'temperatureOptMax', libelle: 'Température optimale max (°C)', type: 'nombre', enListe: true },
      { nom: 'temperatureMax', libelle: 'Température max (°C)', type: 'nombre' },
      { nom: 'oxygeneMin', libelle: 'Oxygène min (mg/L)', type: 'nombre' },
      { nom: 'gainJournalierRef', libelle: 'Gain journalier de référence (g/j)', type: 'nombre', enListe: true },
      { nom: 'indiceConsommationRef', libelle: 'Indice de consommation de référence', type: 'nombre' },
      { nom: 'tauxSurvieRef', libelle: 'Taux de survie de référence', type: 'nombre' },
      { nom: 'poidsMarcheMin', libelle: 'Poids marchand min (g)', type: 'entier' },
      { nom: 'poidsMarcheMax', libelle: 'Poids marchand max (g)', type: 'entier' },
      { nom: 'dureeCycleRef', libelle: 'Durée de cycle de référence (j)', type: 'entier' },
      { nom: 'densiteMaxM2', libelle: 'Densité max (/m²)', type: 'nombre' },
      { nom: 'densiteMaxM3', libelle: 'Densité max (/m³)', type: 'nombre' },
      { nom: 'sourceParametres', libelle: 'Source des paramètres', type: 'texte', aide: 'Traçabilité : d’où viennent ces valeurs.' },
      { nom: 'actif', libelle: 'Actif', type: 'booleen', enListe: true },
    ],
  },
  {
    nom: 'referentiels/types-infrastructure',
    chemin: 'types-infrastructure',
    libelle: "Types d'infrastructure",
    libelleSingulier: 'type d’infrastructure',
    description:
      'Nomenclature FAO portée dès le schéma (D11) : les données doivent rester agrégeables au niveau national.',
    triDefaut: 'nom',
    champs: [
      { nom: 'code', libelle: 'Code', type: 'texte', requis: true, enListe: true },
      { nom: 'nom', libelle: 'Nom', type: 'texte', requis: true, enListe: true },
      { nom: 'forme', libelle: 'Forme', type: 'enum', options: FORMES, enListe: true },
      {
        nom: 'mesureBase',
        libelle: 'Base de mesure',
        type: 'enum',
        options: MESURES,
        enListe: true,
        aide: 'Détermine si densités et rendements se raisonnent au m² ou au m³.',
      },
      { nom: 'milieuFao', libelle: 'Milieu FAO', type: 'enum', options: MILIEUX_FAO, enListe: true },
      { nom: 'systemeFao', libelle: 'Système FAO', type: 'enum', options: SYSTEMES_FAO, enListe: true },
      { nom: 'horsSol', libelle: 'Hors-sol', type: 'booleen' },
      { nom: 'aerable', libelle: 'Aérable', type: 'booleen' },
      { nom: 'densiteMaxDefaut', libelle: 'Densité max par défaut', type: 'nombre' },
      { nom: 'ordre', libelle: 'Ordre d’affichage', type: 'entier' },
      { nom: 'actif', libelle: 'Actif', type: 'booleen', enListe: true },
    ],
  },
  {
    nom: 'referentiels/aliments',
    chemin: 'aliments',
    libelle: 'Aliments',
    libelleSingulier: 'aliment',
    description:
      'La part d’aliment produit localement dans les charges est un indicateur suivi par les bailleurs.',
    triDefaut: 'nom',
    champs: [
      { nom: 'nom', libelle: 'Nom', type: 'texte', requis: true, enListe: true },
      { nom: 'marque', libelle: 'Marque', type: 'texte' },
      { nom: 'granulometrieMm', libelle: 'Granulométrie (mm)', type: 'nombre', enListe: true },
      { nom: 'tauxProteine', libelle: 'Taux de protéine (%)', type: 'nombre', enListe: true },
      { nom: 'prixKg', libelle: 'Prix au kg', type: 'monnaie', enListe: true },
      { nom: 'poidsPoissonMin', libelle: 'Poids poisson min (g)', type: 'entier' },
      { nom: 'poidsPoissonMax', libelle: 'Poids poisson max (g)', type: 'entier' },
      { nom: 'fournisseur', libelle: 'Fournisseur', type: 'texte' },
      { nom: 'local', libelle: 'Produit localement', type: 'booleen', enListe: true },
      { nom: 'actif', libelle: 'Actif', type: 'booleen', enListe: true },
    ],
  },
  {
    nom: 'referentiels/produits-sanitaires',
    chemin: 'produits-sanitaires',
    libelle: 'Produits sanitaires',
    libelleSingulier: 'produit sanitaire',
    description:
      'Le délai d’attente est une règle de sécurité sanitaire des aliments : toute récolte antérieure est non conforme.',
    triDefaut: 'nom',
    champs: [
      { nom: 'nom', libelle: 'Nom', type: 'texte', requis: true, enListe: true },
      { nom: 'matiereActive', libelle: 'Matière active', type: 'texte', enListe: true },
      { nom: 'forme', libelle: 'Forme', type: 'texte' },
      { nom: 'unite', libelle: 'Unité', type: 'texte' },
      { nom: 'dosageRecommande', libelle: 'Dosage recommandé', type: 'nombre' },
      { nom: 'dosageUnite', libelle: 'Unité de dosage', type: 'texte' },
      { nom: 'prixUnitaire', libelle: 'Prix unitaire', type: 'monnaie' },
      {
        nom: 'delaiAttenteJours',
        libelle: 'Délai d’attente (jours)',
        type: 'entier',
        enListe: true,
        aide: 'À confirmer auprès du service vétérinaire — les valeurs du seed sont des places tenues.',
      },
      { nom: 'indication', libelle: 'Indication', type: 'texte', enListe: true },
      { nom: 'actif', libelle: 'Actif', type: 'booleen', enListe: true },
    ],
  },
  {
    nom: 'referentiels/paliers',
    chemin: 'paliers',
    libelle: 'Paliers de rationnement',
    libelleSingulier: 'palier',
    description:
      'Les taux étaient enfouis dans les formules du tableur. Ils sont désormais une donnée visible, modifiable et sourcée (D10).',
    triDefaut: 'poidsMin',
    champs: [
      {
        nom: 'especeId',
        libelle: 'Espèce',
        type: 'relation',
        requis: true,
        ressourceLiee: 'referentiels/especes',
        enListe: true,
      },
      { nom: 'poidsMin', libelle: 'Poids min (g)', type: 'nombre', requis: true, enListe: true },
      { nom: 'poidsMax', libelle: 'Poids max (g)', type: 'nombre', requis: true, enListe: true },
      { nom: 'temperatureMin', libelle: 'Température min (°C)', type: 'nombre', enListe: true },
      { nom: 'temperatureMax', libelle: 'Température max (°C)', type: 'nombre', enListe: true },
      {
        nom: 'tauxPct',
        libelle: 'Taux (%)',
        type: 'nombre',
        requis: true,
        enListe: true,
        aide: 'La base refuse tout taux hors de 0–30 % (contrainte palier_taux_plausible).',
      },
      { nom: 'tauxMinPct', libelle: 'Taux min (%)', type: 'nombre' },
      { nom: 'tauxMaxPct', libelle: 'Taux max (%)', type: 'nombre' },
      { nom: 'frequenceRepas', libelle: 'Repas par jour', type: 'entier', enListe: true },
      { nom: 'source', libelle: 'Source', type: 'texte', enListe: true },
      { nom: 'actif', libelle: 'Actif', type: 'booleen', enListe: true },
    ],
  },
];

export function referentielParChemin(chemin: string): Ressource | undefined {
  return REFERENTIELS.find((r) => r.chemin === chemin);
}
