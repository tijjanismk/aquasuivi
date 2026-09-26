/**
 * Types de domaine d'Aqua-Suivi.
 *
 * Volontairement découplés de Prisma : les mêmes fonctions doivent tourner
 * côté serveur sur des lignes Prisma et côté téléphone sur des enregistrements
 * WatermelonDB. Ce paquet ne connaît donc aucun ORM.
 *
 * Unités, une fois pour toutes :
 *   · poids d'un poisson  → grammes
 *   · biomasse, aliment   → kilogrammes
 *   · montants            → francs CFA entiers (le F CFA n'a pas de subdivision
 *                            en usage, on évite ainsi toute dérive de virgule)
 *   · dates               → chaînes ISO « AAAA-MM-JJ », pas d'objet Date : une
 *                            date de terrain n'a ni heure ni fuseau, et c'est
 *                            précisément ce qui cassait à la synchronisation.
 */

export type DateISO = string;

export type MesureBase = 'SUPERFICIE' | 'VOLUME';
export type FormeInfrastructure = 'RECTANGULAIRE' | 'CIRCULAIRE' | 'IRREGULIERE';
export type StatutCycle = 'EN_COURS' | 'EN_RECOLTE' | 'BOUCLE';
export type TypeRecolte = 'VENTE' | 'DON' | 'AUTOCONSOMMATION';

export interface Espece {
  id: string;
  nom: string;
  codeFao?: string | null;
  gainJournalierRef?: number | null;
  indiceConsommationRef?: number | null;
  tauxSurvieRef?: number | null;
  temperatureOptMin?: number | null;
  temperatureOptMax?: number | null;
  temperatureMin?: number | null;
  temperatureMax?: number | null;
  oxygeneMin?: number | null;
  densiteMaxM2?: number | null;
  densiteMaxM3?: number | null;
  /** Coefficient de variation (%) au-delà duquel un tri s'impose. */
  seuilHeterogeneitePct?: number | null;
}

export interface InfrastructureDim {
  forme: FormeInfrastructure;
  longueur?: number | null;
  largeur?: number | null;
  diametre?: number | null;
  profondeur?: number | null;
  /** Pourcentage de la profondeur réellement en eau. */
  niveauRemplissage?: number | null;
}

export interface Infrastructure extends InfrastructureDim {
  id: string;
  nom: string;
  mesureBase: MesureBase;
  superficie?: number | null;
  volume?: number | null;
}

export interface Lot {
  id: string;
  especeId: string;
  nombre: number;
  poidsMoyenG: number;
  coutUnitaire: number;
  dateMiseEnCharge: DateISO;
}

export interface Mortalite {
  id: string;
  lotId: string;
  dateConstat: DateISO;
  nombre: number;
  remplacement: number;
  coutUnitaire?: number | null;
}

export interface Pesee {
  id: string;
  numero: number;
  dateOperation: DateISO;
  tauxRationPct?: number | null;
}

export interface Echantillon {
  id: string;
  peseeId: string;
  lotId?: string | null;
  numero: number;
  nombre: number;
  poidsTotalG: number;
}

export interface Distribution {
  id: string;
  peseeId?: string | null;
  alimentId: string;
  dateDebut: DateISO;
  quantiteTotaleKg: number;
  prixKgApplique?: number | null;
}

export interface Traitement {
  id: string;
  produitSanitaireId?: string | null;
  dateOperation: DateISO;
  quantite?: number | null;
  prixUnitaire?: number | null;
  finDelaiAttente?: DateISO | null;
}

export interface Recolte {
  id: string;
  lotId?: string | null;
  especeId?: string | null;
  dateOperation: DateISO;
  type: TypeRecolte;
  poidsKg: number;
  nombre?: number | null;
  prixKg: number;
}

export interface Depense {
  id: string;
  categorie: string;
  montant: number;
  dateOperation: DateISO;
}

export interface Cycle {
  id: string;
  numero: number;
  dateMiseEnCharge: DateISO;
  dateCloture?: DateISO | null;
  statut: StatutCycle;
  especeId?: string | null;
}

/** Tout ce qu'il faut pour calculer les indicateurs d'un cycle. */
export interface CycleComplet {
  cycle: Cycle;
  infrastructure: Infrastructure;
  lots: Lot[];
  mortalites: Mortalite[];
  pesees: Pesee[];
  echantillons: Echantillon[];
  distributions: Distribution[];
  traitements: Traitement[];
  recoltes: Recolte[];
  depenses: Depense[];
  /** Référentiel des espèces présentes, pour les repères de performance. */
  especes: Espece[];
}

export interface PalierRationnement {
  id: string;
  especeId: string;
  poidsMin: number;
  poidsMax: number;
  temperatureMin?: number | null;
  temperatureMax?: number | null;
  tauxPct: number;
  frequenceRepas: number;
  source?: string | null;
}
