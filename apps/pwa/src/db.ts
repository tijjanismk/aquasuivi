import Dexie, { type Table } from 'dexie';

/// Base locale du téléphone (D19). Miroir des tables de saisie de l'API, au
/// même format que ce qu'elle renvoie : nombres, dates « AAAA-MM-JJ ». Tant
/// que le format est le même, `calculerIndicateurs` et les contrôles de
/// `@aqua/shared` tournent ici à l'identique.

export type Segment =
  | 'fermes'
  | 'infrastructures'
  | 'cycles'
  | 'lots'
  | 'mortalites'
  | 'pesees'
  | 'echantillons'
  | 'distributions'
  | 'traitements'
  | 'recoltes'
  | 'depenses'
  | 'mesures-eau';

export type SegmentReferentiel =
  | 'especes'
  | 'types-infrastructure'
  | 'aliments'
  | 'produits-sanitaires'
  | 'paliers';

/// Une ligne telle que l'API la renvoie, plus `_version` : son `updatedAt`
/// serveur, qui sert de `versionBase` au prochain push (D21).
export interface Ligne {
  id: string;
  _version?: string | null;
  [champ: string]: any;
}

export interface EntreeJournal {
  seq?: number;
  ressource: Segment;
  id: string;
  operation: 'ecrire' | 'supprimer';
  /// Champs saisis sur le téléphone, jamais les champs dérivés ni l'horodatage.
  donnees?: Record<string, unknown>;
  versionBase: string | null;
  modifieLe: string;
  /// `envoi` : dans un push en vol. Une saisie faite pendant ce temps ouvre
  /// une nouvelle entrée plutôt que de modifier celle qui est partie.
  etat: 'attente' | 'envoi' | 'rejete';
  code?: string;
  message?: string;
}

class Base extends Dexie {
  fermes!: Table<Ligne, string>;
  infrastructures!: Table<Ligne, string>;
  cycles!: Table<Ligne, string>;
  lots!: Table<Ligne, string>;
  mortalites!: Table<Ligne, string>;
  pesees!: Table<Ligne, string>;
  echantillons!: Table<Ligne, string>;
  distributions!: Table<Ligne, string>;
  traitements!: Table<Ligne, string>;
  recoltes!: Table<Ligne, string>;
  depenses!: Table<Ligne, string>;
  mesures!: Table<Ligne, string>;

  especes!: Table<Ligne, string>;
  typesInfrastructure!: Table<Ligne, string>;
  aliments!: Table<Ligne, string>;
  produitsSanitaires!: Table<Ligne, string>;
  paliers!: Table<Ligne, string>;
  regions!: Table<Ligne, string>;
  cercles!: Table<Ligne, string>;
  communes!: Table<Ligne, string>;

  journal!: Table<EntreeJournal, number>;
  meta!: Table<{ cle: string; valeur: unknown }, string>;

  constructor() {
    super('aqua-suivi');
    this.version(1).stores({
      fermes: 'id',
      infrastructures: 'id, fermeId',
      cycles: 'id, infrastructureId',
      lots: 'id, cycleId',
      mortalites: 'id, lotId',
      pesees: 'id, cycleId',
      echantillons: 'id, peseeId, lotId',
      distributions: 'id, cycleId',
      traitements: 'id, cycleId',
      recoltes: 'id, cycleId, lotId',
      depenses: 'id, cycleId',
      mesures: 'id, infrastructureId, cycleId',
      especes: 'id',
      typesInfrastructure: 'id',
      aliments: 'id',
      produitsSanitaires: 'id',
      paliers: 'id, especeId',
      regions: 'id',
      cercles: 'id, regionId',
      communes: 'id, cercleId',
      journal: '++seq, id, etat',
      meta: 'cle',
    });
    // v2 : la pesée et la distribution d'aliment se saisissent ensemble
    // (écran Pesee.tsx), qui a besoin de retrouver la distribution déjà
    // liée à une pesée. Seule la table qui change d'index est listée,
    // Dexie garde le reste tel quel et réindexe les lignes déjà en base.
    this.version(2).stores({
      distributions: 'id, cycleId, peseeId',
    });
  }
}

export const db = new Base();

/// Segment de l'API → table locale.
export const TABLES: Record<Segment, Table<Ligne, string>> = {
  fermes: db.fermes,
  infrastructures: db.infrastructures,
  cycles: db.cycles,
  lots: db.lots,
  mortalites: db.mortalites,
  pesees: db.pesees,
  echantillons: db.echantillons,
  distributions: db.distributions,
  traitements: db.traitements,
  recoltes: db.recoltes,
  depenses: db.depenses,
  'mesures-eau': db.mesures,
};

export const REFERENTIELS: Record<SegmentReferentiel, Table<Ligne, string>> = {
  especes: db.especes,
  'types-infrastructure': db.typesInfrastructure,
  aliments: db.aliments,
  'produits-sanitaires': db.produitsSanitaires,
  paliers: db.paliers,
};

/// Parent direct de chaque ressource : sert à la suppression en cascade
/// locale, comme côté API (D12).
export const PARENT: Partial<Record<Segment, { segment: Segment; champ: string }>> = {
  infrastructures: { segment: 'fermes', champ: 'fermeId' },
  cycles: { segment: 'infrastructures', champ: 'infrastructureId' },
  lots: { segment: 'cycles', champ: 'cycleId' },
  mortalites: { segment: 'lots', champ: 'lotId' },
  pesees: { segment: 'cycles', champ: 'cycleId' },
  echantillons: { segment: 'pesees', champ: 'peseeId' },
  distributions: { segment: 'cycles', champ: 'cycleId' },
  traitements: { segment: 'cycles', champ: 'cycleId' },
  recoltes: { segment: 'cycles', champ: 'cycleId' },
  depenses: { segment: 'cycles', champ: 'cycleId' },
  'mesures-eau': { segment: 'infrastructures', champ: 'infrastructureId' },
};

export async function lireMeta<T>(cle: string): Promise<T | undefined> {
  return (await db.meta.get(cle))?.valeur as T | undefined;
}

export async function ecrireMeta(cle: string, valeur: unknown) {
  await db.meta.put({ cle, valeur });
}
