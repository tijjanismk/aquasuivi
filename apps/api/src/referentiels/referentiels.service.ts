import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/// Segment d'URL → délégué Prisma. Liste blanche : le segment vient de
/// l'URL, il ne doit jamais servir à atteindre un modèle non administrable.
export const RESSOURCES = {
  especes: 'espece',
  'types-infrastructure': 'typeInfrastructure',
  aliments: 'aliment',
  'produits-sanitaires': 'produitSanitaire',
  paliers: 'palierRationnement',
} as const;

export type SegmentRessource = keyof typeof RESSOURCES;

export function estRessource(segment: string): segment is SegmentRessource {
  return Object.hasOwn(RESSOURCES, segment);
}

/// Champs sur lesquels un filtre texte de l'admin a du sens.
const CHAMPS_RECHERCHE: Record<SegmentRessource, string[]> = {
  especes: ['nom', 'nomScientifique', 'nomLocal', 'codeFao'],
  'types-infrastructure': ['nom', 'code'],
  aliments: ['nom', 'marque', 'fournisseur'],
  'produits-sanitaires': ['nom', 'matiereActive', 'indication'],
  paliers: ['source'],
};

export interface OptionsListe {
  debut: number;
  fin: number;
  tri?: string;
  ordre: 'asc' | 'desc';
  recherche?: string;
  inclureInactifs: boolean;
}

type Delegue = {
  findMany(args: unknown): Promise<unknown[]>;
  findUnique(args: unknown): Promise<unknown>;
  count(args: unknown): Promise<number>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
};

@Injectable()
export class ReferentielsService {
  constructor(private readonly prisma: PrismaService) {}

  private delegue(ressource: SegmentRessource): Delegue {
    const client = this.prisma.client as unknown as Record<string, Delegue>;
    return client[RESSOURCES[ressource]]!;
  }

  private where(ressource: SegmentRessource, options: OptionsListe) {
    const where: Record<string, unknown> = {};
    if (!options.inclureInactifs) where['actif'] = true;
    if (options.recherche) {
      where['OR'] = CHAMPS_RECHERCHE[ressource].map((champ) => ({
        [champ]: { contains: options.recherche, mode: 'insensitive' },
      }));
    }
    return where;
  }

  async lister(ressource: SegmentRessource, options: OptionsListe) {
    const where = this.where(ressource, options);
    const delegue = this.delegue(ressource);
    const [lignes, total] = await Promise.all([
      delegue.findMany({
        where,
        skip: options.debut,
        take: Math.max(options.fin - options.debut, 0),
        ...(options.tri ? { orderBy: { [options.tri]: options.ordre } } : {}),
        ...(ressource === 'paliers' ? { include: { espece: { select: { nom: true } } } } : {}),
      }),
      delegue.count({ where }),
    ]);
    return { lignes, total };
  }

  async lire(ressource: SegmentRessource, id: string) {
    const ligne = await this.delegue(ressource).findUnique({ where: { id } });
    if (!ligne) throw new NotFoundException(`${ressource}/${id} introuvable`);
    return ligne;
  }

  creer(ressource: SegmentRessource, donnees: unknown) {
    return this.delegue(ressource).create({ data: donnees });
  }

  modifier(ressource: SegmentRessource, id: string, donnees: unknown) {
    return this.delegue(ressource).update({ where: { id }, data: donnees });
  }

  /// Un référentiel utilisé ne se supprime pas : les FK sont en `Restrict`
  /// et les lignes passées doivent rester lisibles. On désactive.
  desactiver(ressource: SegmentRessource, id: string) {
    return this.delegue(ressource).update({ where: { id }, data: { actif: false } });
  }
}
