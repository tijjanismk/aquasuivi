/// Tables de terrain. Hiérarchiques : une pesée n'existe que dans un cycle,
/// une mortalité que dans un lot. Les écrans suivent cette hiérarchie plutôt
/// que d'offrir douze listes plates.

import type { Ressource } from './description';

const STATUTS = ['EN_COURS', 'EN_RECOLTE', 'BOUCLE'] as const;
const TYPES_RECOLTE = ['VENTE', 'DON', 'AUTOCONSOMMATION'] as const;
const ORIGINES_LOT = ['ECLOSERIE', 'CAPTURE', 'PRODUCTION_PROPRE'] as const;
const CATEGORIES_DEPENSE = [
  'EAU',
  'MAIN_OEUVRE',
  'AMORTISSEMENT',
  'TRANSPORT',
  'ENERGIE',
  'AUTRE',
] as const;

export const FERMES: Ressource = {
  nom: 'saisie/fermes',
  chemin: 'fermes',
  libelle: 'Fermes',
  libelleSingulier: 'ferme',
  description:
    'Exploitations suivies. La géographie est en clés étrangères, jamais en texte libre : une production doit pouvoir être agrégée par commune, cercle et région.',
  triDefaut: 'nom',
  champs: [
    { nom: 'nom', libelle: 'Nom', type: 'texte', requis: true, enListe: true },
    { nom: 'promoteur', libelle: 'Promoteur', type: 'texte', enListe: true },
    { nom: 'telephone', libelle: 'Téléphone', type: 'texte' },
    { nom: 'email', libelle: 'Courriel', type: 'texte' },
    { nom: 'cooperative', libelle: 'Coopérative', type: 'texte' },
    { nom: 'pays', libelle: 'Pays', type: 'texte' },
    { nom: 'regionId', libelle: 'Région / district', type: 'relation', ressourceLiee: 'geographie/regions', enListe: true },
    { nom: 'cercleId', libelle: 'Cercle', type: 'relation', ressourceLiee: 'geographie/cercles', dependDe: 'regionId' },
    {
      nom: 'communeId',
      libelle: 'Commune',
      type: 'relation',
      ressourceLiee: 'geographie/communes',
      dependDe: 'cercleId',
      enListe: true,
    },
    { nom: 'village', libelle: 'Village', type: 'texte', enListe: true },
    {
      nom: 'latitude',
      libelle: 'Latitude',
      type: 'nombre',
      aide: 'Précision au centimètre. Laisser vide plutôt que d’approximer.',
    },
    { nom: 'longitude', libelle: 'Longitude', type: 'nombre' },
    { nom: 'altitude', libelle: 'Altitude (m)', type: 'nombre' },
    { nom: 'dateCreation', libelle: 'Date de création', type: 'date' },
    { nom: 'actif', libelle: 'Active', type: 'booleen', enListe: true },
  ],
};

export const INFRASTRUCTURES: Ressource = {
  nom: 'saisie/infrastructures',
  chemin: 'infrastructures',
  libelle: 'Infrastructures',
  libelleSingulier: 'infrastructure',
  description:
    'Bassins, étangs, cages. La superficie et le volume ne se saisissent pas : ils sont calculés à l’écriture à partir des dimensions, par la même fonction que le mobile.',
  triDefaut: 'nom',
  parent: { ressource: 'saisie/fermes', champ: 'fermeId' },
  champs: [
    { nom: 'nom', libelle: 'Nom', type: 'texte', requis: true, enListe: true },
    { nom: 'fermeId', libelle: 'Ferme', type: 'relation', ressourceLiee: 'saisie/fermes' },
    {
      nom: 'typeInfrastructureId',
      libelle: 'Type',
      type: 'relation',
      requis: true,
      ressourceLiee: 'referentiels/types-infrastructure',
      enListe: true,
      aide: 'Détermine la forme, donc la formule de surface, et la base de mesure (m² ou m³).',
    },
    { nom: 'longueur', libelle: 'Longueur (m)', type: 'nombre' },
    { nom: 'largeur', libelle: 'Largeur (m)', type: 'nombre' },
    { nom: 'diametre', libelle: 'Diamètre (m)', type: 'nombre', aide: 'Pour les formes circulaires.' },
    { nom: 'profondeur', libelle: 'Profondeur (m)', type: 'nombre' },
    {
      nom: 'niveauRemplissage',
      libelle: 'Niveau de remplissage (%)',
      type: 'nombre',
      aide: 'Un bassin d’un mètre rempli à 80 % ne contient pas le volume de sa profondeur totale.',
    },
    { nom: 'superficie', libelle: 'Superficie (m²)', type: 'nombre', enListe: true, calcule: true },
    { nom: 'volume', libelle: 'Volume (m³)', type: 'nombre', enListe: true, calcule: true },
    { nom: 'dateConstruction', libelle: 'Date de construction', type: 'date' },
    { nom: 'actif', libelle: 'Active', type: 'booleen', enListe: true },
  ],
};

export const CYCLES: Ressource = {
  nom: 'saisie/cycles',
  chemin: 'cycles',
  libelle: 'Cycles',
  libelleSingulier: 'cycle',
  description:
    'De la mise en charge à la vidange. La base refuse deux cycles ouverts sur la même infrastructure — c’est le garde-fou de la synchronisation.',
  triDefaut: 'dateMiseEnCharge',
  ordreDefaut: 'desc',
  parent: { ressource: 'saisie/infrastructures', champ: 'infrastructureId' },
  champs: [
    { nom: 'numero', libelle: 'Numéro', type: 'entier', enListe: true, aide: 'Laissé vide, le suivant est attribué.' },
    {
      nom: 'infrastructureId',
      libelle: 'Infrastructure',
      type: 'relation',
      ressourceLiee: 'saisie/infrastructures',
    },
    {
      nom: 'dateMiseEnCharge',
      libelle: 'Mise en charge',
      type: 'date',
      requis: true,
      enListe: true,
    },
    { nom: 'dateCloture', libelle: 'Clôture', type: 'date', enListe: true },
    { nom: 'statut', libelle: 'Statut', type: 'enum', options: STATUTS, enListe: true },
    {
      nom: 'especeId',
      libelle: 'Espèce dominante',
      type: 'relation',
      ressourceLiee: 'referentiels/especes',
      enListe: true,
      aide: 'Facultative. En polyculture, l’espèce qui fait foi est celle du lot.',
    },
    { nom: 'observation', libelle: 'Observation', type: 'texteLong' },
  ],
};

export const LOTS: Ressource = {
  nom: 'saisie/lots',
  chemin: 'lots',
  libelle: 'Lots',
  libelleSingulier: 'lot',
  description:
    'Un lot = une espèce mise en charge. Plusieurs lots par cycle rendent la polyculture possible.',
  triDefaut: 'dateMiseEnCharge',
  parent: { ressource: 'saisie/cycles', champ: 'cycleId' },
  champs: [
    {
      nom: 'especeId',
      libelle: 'Espèce',
      type: 'relation',
      requis: true,
      ressourceLiee: 'referentiels/especes',
      enListe: true,
    },
    { nom: 'cycleId', libelle: 'Cycle', type: 'relation', ressourceLiee: 'saisie/cycles' },
    { nom: 'nombre', libelle: 'Nombre', type: 'entier', requis: true, enListe: true },
    { nom: 'poidsMoyenG', libelle: 'Poids moyen (g)', type: 'nombre', requis: true, enListe: true },
    { nom: 'coutUnitaire', libelle: 'Coût unitaire', type: 'monnaie', enListe: true },
    { nom: 'dateMiseEnCharge', libelle: 'Mise en charge', type: 'date', requis: true, enListe: true },
    { nom: 'origine', libelle: 'Origine', type: 'enum', options: ORIGINES_LOT },
    { nom: 'souche', libelle: 'Souche', type: 'texte' },
  ],
};

export const MORTALITES: Ressource = {
  nom: 'saisie/mortalites',
  chemin: 'mortalites',
  libelle: 'Mortalités',
  libelleSingulier: 'mortalité',
  description:
    'Datée par elle-même, pas par la pêche de contrôle : sans quoi elle serait impossible à situer entre deux pesées.',
  triDefaut: 'dateConstat',
  parent: { ressource: 'saisie/lots', champ: 'lotId' },
  champs: [
    { nom: 'dateConstat', libelle: 'Date du constat', type: 'date', requis: true, enListe: true },
    { nom: 'lotId', libelle: 'Lot', type: 'relation', ressourceLiee: 'saisie/lots' },
    { nom: 'nombre', libelle: 'Nombre', type: 'entier', requis: true, enListe: true },
    { nom: 'remplacement', libelle: 'Remplacements', type: 'entier', enListe: true },
    { nom: 'coutUnitaire', libelle: 'Coût unitaire', type: 'monnaie' },
    { nom: 'cause', libelle: 'Cause', type: 'texte', enListe: true },
  ],
};

export const PESEES: Ressource = {
  nom: 'saisie/pesees',
  chemin: 'pesees',
  libelle: 'Pesées',
  libelleSingulier: 'pesée',
  description:
    'Pêche de contrôle. Le nombre de pesées est libre — c’est la différence de fond avec le tableur d’origine.',
  triDefaut: 'dateOperation',
  parent: { ressource: 'saisie/cycles', champ: 'cycleId' },
  champs: [
    { nom: 'numero', libelle: 'Numéro', type: 'entier', enListe: true, aide: 'Laissé vide, le suivant est attribué.' },
    { nom: 'cycleId', libelle: 'Cycle', type: 'relation', ressourceLiee: 'saisie/cycles' },
    { nom: 'dateOperation', libelle: 'Date', type: 'date', requis: true, enListe: true },
    {
      nom: 'tauxRationPct',
      libelle: 'Taux de ration (%)',
      type: 'nombre',
      enListe: true,
      aide: 'La base refuse tout taux hors de 0–10 %.',
    },
    { nom: 'observation', libelle: 'Observation', type: 'texteLong' },
  ],
};

export const ECHANTILLONS: Ressource = {
  nom: 'saisie/echantillons',
  chemin: 'echantillons',
  libelle: 'Échantillons',
  libelleSingulier: 'échantillon',
  description:
    'Les échantillons sont conservés individuellement, pas leur moyenne : c’est ce qui donne le coefficient de variation, donc la décision de tri.',
  triDefaut: 'numero',
  parent: { ressource: 'saisie/pesees', champ: 'peseeId' },
  champs: [
    { nom: 'numero', libelle: 'Numéro', type: 'entier', enListe: true, aide: 'Laissé vide, le suivant est attribué.' },
    { nom: 'peseeId', libelle: 'Pesée', type: 'relation', ressourceLiee: 'saisie/pesees' },
    {
      nom: 'lotId',
      libelle: 'Lot',
      type: 'relation',
      ressourceLiee: 'saisie/lots',
      libelleLie: 'id',
      aide: 'En polyculture, l’échantillon se rattache au lot pesé.',
    },
    {
      nom: 'nombre',
      libelle: 'Nombre de poissons',
      type: 'entier',
      requis: true,
      enListe: true,
      aide: 'La base refuse un échantillon vide.',
    },
    { nom: 'poidsTotalG', libelle: 'Poids total (g)', type: 'nombre', requis: true, enListe: true },
  ],
};

export const DISTRIBUTIONS: Ressource = {
  nom: 'saisie/distributions',
  chemin: 'distributions',
  libelle: 'Distributions',
  libelleSingulier: 'distribution',
  description:
    'On enregistre l’aliment réellement distribué, pas le planifié : l’indice de consommation n’a de sens que sur du réel.',
  triDefaut: 'dateDebut',
  parent: { ressource: 'saisie/cycles', champ: 'cycleId' },
  champs: [
    { nom: 'dateDebut', libelle: 'Début', type: 'date', requis: true, enListe: true },
    { nom: 'cycleId', libelle: 'Cycle', type: 'relation', ressourceLiee: 'saisie/cycles' },
    { nom: 'dateFin', libelle: 'Fin', type: 'date' },
    {
      nom: 'alimentId',
      libelle: 'Aliment',
      type: 'relation',
      requis: true,
      ressourceLiee: 'referentiels/aliments',
      enListe: true,
    },
    { nom: 'quantiteTotaleKg', libelle: 'Quantité (kg)', type: 'nombre', requis: true, enListe: true },
    { nom: 'rationKgJour', libelle: 'Ration (kg/j)', type: 'nombre' },
    {
      nom: 'prixKgApplique',
      libelle: 'Prix au kg appliqué',
      type: 'monnaie',
      enListe: true,
      aide: 'Prix au moment de l’achat : le référentiel évolue, les charges passées non.',
    },
  ],
};

export const TRAITEMENTS: Ressource = {
  nom: 'saisie/traitements',
  chemin: 'traitements',
  libelle: 'Traitements',
  libelleSingulier: 'traitement',
  description:
    'La fin du délai d’attente est calculée à partir du produit. Toute récolte antérieure est signalée non conforme — c’est une règle de sécurité sanitaire.',
  triDefaut: 'dateOperation',
  parent: { ressource: 'saisie/cycles', champ: 'cycleId' },
  champs: [
    { nom: 'dateOperation', libelle: 'Date', type: 'date', requis: true, enListe: true },
    { nom: 'cycleId', libelle: 'Cycle', type: 'relation', ressourceLiee: 'saisie/cycles' },
    {
      nom: 'produitSanitaireId',
      libelle: 'Produit',
      type: 'relation',
      ressourceLiee: 'referentiels/produits-sanitaires',
      enListe: true,
    },
    { nom: 'quantite', libelle: 'Quantité', type: 'nombre' },
    { nom: 'prixUnitaire', libelle: 'Prix unitaire', type: 'monnaie', enListe: true },
    { nom: 'motif', libelle: 'Motif', type: 'texte' },
    {
      nom: 'finDelaiAttente',
      libelle: 'Fin du délai d’attente',
      type: 'date',
      enListe: true,
      calcule: true,
    },
  ],
};

export const RECOLTES: Ressource = {
  nom: 'saisie/recoltes',
  chemin: 'recoltes',
  libelle: 'Récoltes',
  libelleSingulier: 'récolte',
  description:
    'Vente, don ou autoconsommation — autant de lignes que de jours de sortie. Dons et autoconsommation sont valorisés comme les ventes.',
  triDefaut: 'dateOperation',
  parent: { ressource: 'saisie/cycles', champ: 'cycleId' },
  champs: [
    { nom: 'dateOperation', libelle: 'Date', type: 'date', requis: true, enListe: true },
    { nom: 'cycleId', libelle: 'Cycle', type: 'relation', ressourceLiee: 'saisie/cycles' },
    { nom: 'type', libelle: 'Type', type: 'enum', options: TYPES_RECOLTE, requis: true, enListe: true },
    { nom: 'poidsKg', libelle: 'Poids (kg)', type: 'nombre', requis: true, enListe: true },
    {
      nom: 'nombre',
      libelle: 'Nombre',
      type: 'entier',
      aide: 'Facultatif, mais donne le poids moyen réel — une mesure vaut mieux qu’une estimation.',
    },
    { nom: 'prixKg', libelle: 'Prix au kg', type: 'monnaie', enListe: true },
    {
      nom: 'especeId',
      libelle: 'Espèce',
      type: 'relation',
      ressourceLiee: 'referentiels/especes',
      enListe: true,
    },
    { nom: 'lotId', libelle: 'Lot', type: 'relation', ressourceLiee: 'saisie/lots', libelleLie: 'id' },
    { nom: 'destination', libelle: 'Destination', type: 'texte' },
  ],
};

export const DEPENSES: Ressource = {
  nom: 'saisie/depenses',
  chemin: 'depenses',
  libelle: 'Dépenses',
  libelleSingulier: 'dépense',
  description: 'Charges du cycle hors alevins, aliments et traitements, qui sont déjà comptés ailleurs.',
  triDefaut: 'dateOperation',
  parent: { ressource: 'saisie/cycles', champ: 'cycleId' },
  champs: [
    { nom: 'dateOperation', libelle: 'Date', type: 'date', requis: true, enListe: true },
    { nom: 'cycleId', libelle: 'Cycle', type: 'relation', ressourceLiee: 'saisie/cycles' },
    {
      nom: 'categorie',
      libelle: 'Catégorie',
      type: 'enum',
      options: CATEGORIES_DEPENSE,
      enListe: true,
    },
    { nom: 'montant', libelle: 'Montant', type: 'monnaie', requis: true, enListe: true },
    { nom: 'description', libelle: 'Description', type: 'texte', enListe: true },
  ],
};

export const MESURES_EAU: Ressource = {
  nom: 'saisie/mesures-eau',
  chemin: 'mesures-eau',
  libelle: 'Qualité de l’eau',
  libelleSingulier: 'mesure',
  description:
    'Rien n’est obligatoire au-delà de la date : une mesure partielle vaut mieux qu’un relevé abandonné.',
  triDefaut: 'dateMesure',
  ordreDefaut: 'desc',
  parent: { ressource: 'saisie/cycles', champ: 'cycleId' },
  champs: [
    { nom: 'dateMesure', libelle: 'Date', type: 'date', requis: true, enListe: true },
    { nom: 'cycleId', libelle: 'Cycle', type: 'relation', ressourceLiee: 'saisie/cycles' },
    {
      nom: 'heure',
      libelle: 'Heure',
      type: 'texte',
      enListe: true,
      aide: 'L’oxygène varie dans la journée : 6 mg/L à seize heures ne dit rien du minimum de l’aube.',
    },
    { nom: 'temperature', libelle: 'Température (°C)', type: 'nombre', enListe: true },
    { nom: 'oxygeneDissous', libelle: 'Oxygène (mg/L)', type: 'nombre', enListe: true },
    { nom: 'ph', libelle: 'pH', type: 'nombre', enListe: true },
    { nom: 'transparenceSecchi', libelle: 'Transparence Secchi (cm)', type: 'entier' },
    { nom: 'ammoniacNh3', libelle: 'Ammoniac NH₃ (mg/L)', type: 'nombre' },
    { nom: 'nitrites', libelle: 'Nitrites (mg/L)', type: 'nombre' },
    { nom: 'alcalinite', libelle: 'Alcalinité (mg/L)', type: 'nombre' },
    { nom: 'salinite', libelle: 'Salinité', type: 'nombre' },
    { nom: 'observation', libelle: 'Observation', type: 'texteLong' },
  ],
};

/// Sections de la fiche d'un cycle, dans l'ordre du déroulé d'un élevage.
export const SECTIONS_CYCLE: Ressource[] = [
  LOTS,
  PESEES,
  DISTRIBUTIONS,
  TRAITEMENTS,
  RECOLTES,
  DEPENSES,
  MESURES_EAU,
];

export const RESSOURCES_SAISIE: Ressource[] = [
  FERMES,
  INFRASTRUCTURES,
  CYCLES,
  ...SECTIONS_CYCLE,
  MORTALITES,
  ECHANTILLONS,
];
