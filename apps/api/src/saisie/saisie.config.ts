/// Tables de saisie : celles qui portent `deletedAt` (D12) et dont les
/// identifiants sont des ULID engendrés par le client (D3).
///
/// `filtres` est une liste blanche : le nom du filtre vient de l'URL et ne
/// doit jamais servir à interroger une colonne arbitraire.

export interface ConfigRessource {
  modele: string;
  filtres: readonly string[];
  tri: string;
  /// Relations chargées en liste, pour éviter un aller-retour par ligne.
  inclut?: Record<string, unknown>;
}

export const RESSOURCES = {
  fermes: {
    modele: 'ferme',
    filtres: ['regionId', 'cercleId', 'communeId', 'actif'],
    tri: 'nom',
    inclut: {
      region: { select: { nom: true } },
      cercle: { select: { nom: true } },
      commune: { select: { nom: true } },
    },
  },
  infrastructures: {
    modele: 'infrastructure',
    filtres: ['fermeId', 'typeInfrastructureId', 'actif'],
    tri: 'nom',
    inclut: {
      ferme: { select: { nom: true } },
      typeInfrastructure: { select: { nom: true, forme: true, mesureBase: true } },
    },
  },
  cycles: {
    modele: 'cycle',
    filtres: ['infrastructureId', 'statut', 'especeId'],
    tri: 'dateMiseEnCharge',
    inclut: {
      infrastructure: { select: { nom: true, fermeId: true } },
      espece: { select: { nom: true } },
    },
  },
  lots: {
    modele: 'lot',
    filtres: ['cycleId', 'especeId'],
    tri: 'dateMiseEnCharge',
    inclut: { espece: { select: { nom: true } } },
  },
  mortalites: {
    modele: 'mortalite',
    filtres: ['lotId'],
    tri: 'dateConstat',
  },
  pesees: {
    modele: 'pesee',
    filtres: ['cycleId'],
    tri: 'dateOperation',
  },
  echantillons: {
    modele: 'echantillon',
    filtres: ['peseeId', 'lotId'],
    tri: 'numero',
  },
  distributions: {
    modele: 'distribution',
    filtres: ['cycleId', 'peseeId', 'alimentId'],
    tri: 'dateDebut',
    inclut: { aliment: { select: { nom: true } } },
  },
  traitements: {
    modele: 'traitement',
    filtres: ['cycleId', 'produitSanitaireId'],
    tri: 'dateOperation',
    inclut: { produitSanitaire: { select: { nom: true } } },
  },
  recoltes: {
    modele: 'recolte',
    filtres: ['cycleId', 'lotId', 'especeId', 'type'],
    tri: 'dateOperation',
    inclut: { espece: { select: { nom: true } } },
  },
  depenses: {
    modele: 'depense',
    filtres: ['cycleId', 'categorie'],
    tri: 'dateOperation',
  },
  'mesures-eau': {
    modele: 'mesureEau',
    filtres: ['infrastructureId', 'cycleId', 'peseeId'],
    tri: 'dateMesure',
  },
} as const satisfies Record<string, ConfigRessource>;

export type SegmentSaisie = keyof typeof RESSOURCES;

export function estRessourceSaisie(segment: string): segment is SegmentSaisie {
  return Object.hasOwn(RESSOURCES, segment);
}

/// Parent direct de chaque ressource : nom de la relation Prisma et segment.
/// Tout le reste en découle — chemin jusqu'à la ferme pour les droits (D18),
/// descendants pour la suppression en cascade (D12).
export const PARENT_DE: Partial<Record<SegmentSaisie, { relation: string; segment: SegmentSaisie }>> = {
  infrastructures: { relation: 'ferme', segment: 'fermes' },
  cycles: { relation: 'infrastructure', segment: 'infrastructures' },
  lots: { relation: 'cycle', segment: 'cycles' },
  mortalites: { relation: 'lot', segment: 'lots' },
  pesees: { relation: 'cycle', segment: 'cycles' },
  echantillons: { relation: 'pesee', segment: 'pesees' },
  distributions: { relation: 'cycle', segment: 'cycles' },
  traitements: { relation: 'cycle', segment: 'cycles' },
  recoltes: { relation: 'cycle', segment: 'cycles' },
  depenses: { relation: 'cycle', segment: 'cycles' },
  'mesures-eau': { relation: 'infrastructure', segment: 'infrastructures' },
};

type Filtre = Record<string, unknown>;

/// Filtre sur `ressource` qui exige que son ancêtre `ancetre` vérifie
/// `filtre`. `null` si `ancetre` n'est pas un ancêtre de `ressource`.
export function versAncetre(
  ressource: SegmentSaisie,
  ancetre: SegmentSaisie,
  filtre: Filtre,
): Filtre | null {
  if (ressource === ancetre) return filtre;
  const parent = PARENT_DE[ressource];
  if (!parent) return null;
  const auDessus = versAncetre(parent.segment, ancetre, filtre);
  return auDessus === null ? null : { [parent.relation]: auDessus };
}

export const versFerme = (ressource: SegmentSaisie, ferme: Filtre) =>
  versAncetre(ressource, 'fermes', ferme)!;

/// Clés étrangères vers d'autres lignes de saisie. Chacune est vérifiée à
/// l'écriture : sans quoi on rattacherait une pesée au cycle d'une ferme
/// qu'on ne gère pas.
export const PARENTS: Record<string, SegmentSaisie> = {
  fermeId: 'fermes',
  infrastructureId: 'infrastructures',
  cycleId: 'cycles',
  lotId: 'lots',
  peseeId: 'pesees',
};
