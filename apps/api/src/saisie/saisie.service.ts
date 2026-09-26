import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { dimensionsCalculees, ajouterJours } from '@aqua/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { versEntree } from '../common/domaine.js';
import {
  PARENTS,
  RESSOURCES,
  versAncetre,
  versFerme,
  type SegmentSaisie,
} from './saisie.config.js';
import { ControlesService } from './controles.service.js';
import type { UtilisateurConnecte } from '../auth/garde.js';
import {
  fermesLisibles,
  fermesModifiables,
  niveauCreateur,
  type PorteeFerme,
} from '../auth/portee.js';

export interface OptionsListe {
  debut: number;
  fin: number;
  tri?: string;
  ordre: 'asc' | 'desc';
  filtres: Record<string, string>;
}

type Delegue = {
  findMany(args: unknown): Promise<unknown[]>;
  findUnique(args: unknown): Promise<unknown>;
  findFirst(args: unknown): Promise<unknown>;
  count(args: unknown): Promise<number>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  updateMany(args: unknown): Promise<unknown>;
  aggregate(args: unknown): Promise<{ _max: Record<string, number | null> }>;
};

function nombre(valeur: unknown): number | null {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const n = Number(valeur);
  return Number.isFinite(n) ? n : null;
}

/// Seules des valeurs scalaires entrent. Un objet imbriqué deviendrait une
/// écriture de relation Prisma : `{ acces: { create: … } }` suffirait à
/// s'attribuer la ferme d'un autre.
function scalaires(donnees: Record<string, unknown>): Record<string, unknown> {
  for (const [cle, valeur] of Object.entries(donnees)) {
    if (valeur !== null && typeof valeur === 'object') {
      throw new BadRequestException({
        code: 'CHAMPS_INVALIDES',
        message: `Le champ ${cle} doit être une valeur simple.`,
      });
    }
  }
  return { ...donnees };
}

/// Jamais fournis par le client : un `updatedAt` antidaté cacherait une
/// modification au pull de synchronisation, qui filtre dessus.
const HORODATAGES = ['createdAt', 'updatedAt', 'deletedAt'];

@Injectable()
export class SaisieService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly controles: ControlesService,
  ) {}

  private delegue(ressource: SegmentSaisie): Delegue {
    const client = this.prisma.client as unknown as Record<string, Delegue>;
    return client[RESSOURCES[ressource].modele]!;
  }

  private where(ressource: SegmentSaisie, filtres: Record<string, string>) {
    const autorises = RESSOURCES[ressource].filtres as readonly string[];
    const where: Record<string, unknown> = {};
    for (const [cle, valeur] of Object.entries(filtres)) {
      if (!autorises.includes(cle) || valeur === '') continue;
      where[cle] = valeur === 'true' ? true : valeur === 'false' ? false : valeur;
    }
    return where;
  }

  /// Portée d'une ressource pour cet utilisateur, exprimée sur ses colonnes.
  private portee(ressource: SegmentSaisie, ferme: PorteeFerme) {
    return ferme === null ? {} : versFerme(ressource, ferme);
  }

  async lister(ressource: SegmentSaisie, options: OptionsListe, u: UtilisateurConnecte) {
    const config = RESSOURCES[ressource];
    const where = {
      AND: [this.where(ressource, options.filtres), this.portee(ressource, fermesLisibles(u))],
    };
    const delegue = this.delegue(ressource);
    const [lignes, total] = await Promise.all([
      delegue.findMany({
        where,
        skip: options.debut,
        take: Math.max(options.fin - options.debut, 0),
        orderBy: { [options.tri ?? config.tri]: options.ordre },
        ...('inclut' in config ? { include: config.inclut } : {}),
      }),
      delegue.count({ where }),
    ]);
    return { lignes, total };
  }

  async lire(ressource: SegmentSaisie, id: string, u: UtilisateurConnecte) {
    const config = RESSOURCES[ressource];
    const ligne = await this.delegue(ressource).findFirst({
      where: { AND: [{ id }, this.portee(ressource, fermesLisibles(u))] },
      ...('inclut' in config ? { include: config.inclut } : {}),
    });
    // 404 plutôt que 403 : ne pas révéler qu'une ligne existe chez autrui.
    if (!ligne) throw new NotFoundException(`${ressource}/${id} introuvable`);
    return ligne;
  }

  async creer(ressource: SegmentSaisie, donnees: Record<string, unknown>, u: UtilisateurConnecte) {
    const entree = scalaires(donnees);
    for (const cle of HORODATAGES) delete entree[cle];
    await this.verifierParents(entree, u);
    const data = await this.appliquerRegles(ressource, versEntree(entree));
    await this.numeroter(ressource, data);
    await this.controles.verifier(ressource, data);

    if (ressource === 'mesures-eau') data['auteurId'] = u.id;
    if (ressource === 'fermes') {
      const niveau = niveauCreateur(u);
      // Même écriture que la ferme : jamais de ferme orpheline de son créateur.
      if (niveau) data['acces'] = { create: { userId: u.id, niveau } };
    }
    return this.delegue(ressource).create({ data });
  }

  async modifier(
    ressource: SegmentSaisie,
    id: string,
    donnees: Record<string, unknown>,
    u: UtilisateurConnecte,
  ) {
    await this.verifierEcriture(ressource, id, u);
    const entree = scalaires(donnees);
    for (const cle of ['id', 'auteurId', ...HORODATAGES]) delete entree[cle];
    // Numéro vidé dans un formulaire : on garde l'existant, il est attribué par l'API.
    if (entree['numero'] === null || entree['numero'] === '') delete entree['numero'];
    await this.verifierParents(entree, u);
    const data = await this.appliquerRegles(ressource, versEntree(entree), id);
    await this.controles.verifier(ressource, data, id);
    return this.delegue(ressource).update({ where: { id }, data });
  }

  /// Suppression douce : une suppression hors ligne doit se propager sans
  /// faire disparaître une ligne qu'un autre appareil vient de modifier (D12).
  ///
  /// La suppression descend aux enfants, à la même date : une pesée d'un
  /// cycle supprimé ne doit plus compter nulle part, et la synchronisation doit
  /// pouvoir propager chaque ligne supprimée une à une.
  async supprimer(ressource: SegmentSaisie, id: string, u: UtilisateurConnecte) {
    await this.verifierEcriture(ressource, id, u);
    const maintenant = new Date();
    return this.prisma.client.$transaction(async (tx) => {
      const client = tx as unknown as Record<string, Delegue>;
      for (const enfant of Object.keys(RESSOURCES) as SegmentSaisie[]) {
        if (enfant === ressource) continue;
        const filtre = versAncetre(enfant, ressource, { id });
        if (!filtre) continue;
        await client[RESSOURCES[enfant].modele]!.updateMany({
          where: { ...filtre, deletedAt: null },
          data: { deletedAt: maintenant },
        });
      }
      return client[RESSOURCES[ressource].modele]!.update({
        where: { id },
        data: { deletedAt: maintenant },
      });
    });
  }

  /// Numéro suivant quand le client n'en donne pas. Les lignes supprimées
  /// comptent : l'unicité du numéro porte aussi sur elles.
  private async numeroter(ressource: SegmentSaisie, data: Record<string, unknown>) {
    if (data['numero'] !== undefined && data['numero'] !== null && data['numero'] !== '') return;
    const portee: Partial<Record<SegmentSaisie, string[]>> = {
      cycles: ['infrastructureId'],
      pesees: ['cycleId'],
      echantillons: ['peseeId', 'lotId'],
    };
    const cles = portee[ressource];
    if (!cles) return;
    const where: Record<string, unknown> = { deletedAt: undefined };
    for (const cle of cles) where[cle] = data[cle] ?? null;
    const { _max } = await this.delegue(ressource).aggregate({ where, _max: { numero: true } });
    data['numero'] = (_max['numero'] ?? 0) + 1;
  }

  /// Droit d'écriture sur une ligne, **y compris supprimée** : la
  /// synchronisation doit pouvoir arbitrer un conflit sur une ligne effacée.
  async peutEcrire(ressource: SegmentSaisie, id: string, u: UtilisateurConnecte) {
    const n = await this.delegue(ressource).count({
      where: { AND: [{ id }, this.portee(ressource, fermesModifiables(u))], deletedAt: undefined },
    });
    return n > 0;
  }

  /// Ligne brute, supprimée ou non, sans contrôle d'accès : réservé à
  /// l'arbitrage de la synchronisation, après `peutEcrire`.
  brute(ressource: SegmentSaisie, id: string) {
    return this.delegue(ressource).findFirst({ where: { id, deletedAt: undefined } }) as Promise<
      (Record<string, unknown> & { updatedAt: Date; deletedAt: Date | null }) | null
    >;
  }

  /// Portée de lecture d'une ressource, pour le pull.
  porteeLecture(ressource: SegmentSaisie, u: UtilisateurConnecte) {
    return this.portee(ressource, fermesLisibles(u));
  }

  private async verifierEcriture(ressource: SegmentSaisie, id: string, u: UtilisateurConnecte) {
    const delegue = this.delegue(ressource);
    const modifiable = await delegue.count({
      where: { AND: [{ id }, this.portee(ressource, fermesModifiables(u))] },
    });
    if (modifiable > 0) return;
    const lisible = await delegue.count({
      where: { AND: [{ id }, this.portee(ressource, fermesLisibles(u))] },
    });
    if (lisible > 0) {
      throw new ForbiddenException({
        code: 'LECTURE_SEULE',
        message: 'Accès en lecture seule sur cette ferme.',
      });
    }
    throw new NotFoundException(`${ressource}/${id} introuvable`);
  }

  /// Toute clé étrangère vers une ligne de saisie doit viser une ferme que
  /// l'utilisateur peut modifier.
  private async verifierParents(data: Record<string, unknown>, u: UtilisateurConnecte) {
    const ferme = fermesModifiables(u);
    if (ferme === null) return;
    for (const [cle, parent] of Object.entries(PARENTS)) {
      const valeur = data[cle];
      if (valeur === undefined || valeur === null || valeur === '') continue;
      const trouve = await this.delegue(parent).count({
        where: { AND: [{ id: String(valeur) }, this.portee(parent, ferme)] },
      });
      if (trouve === 0) {
        throw new ForbiddenException({
          code: 'PARENT_INACCESSIBLE',
          message: `${cle} désigne une ligne introuvable ou hors de vos fermes.`,
        });
      }
    }
  }

  /// Champs dérivés que personne ne doit avoir à ressaisir — ni à recalculer
  /// différemment d'un client à l'autre.
  private async appliquerRegles(
    ressource: SegmentSaisie,
    data: Record<string, unknown>,
    id?: string,
  ): Promise<Record<string, unknown>> {
    if (ressource === 'infrastructures') return this.dimensions(data, id);
    if (ressource === 'traitements') return this.delaiAttente(data, id);
    if (ressource === 'cycles') return this.statutCycle(data, id);
    return data;
  }

  /// Le statut suit la date de clôture quand le client ne le précise pas :
  /// c'est la date que regarde l'index « un seul cycle ouvert », et un statut
  /// resté « en cours » sur un cycle daté de clôture fausserait les listes.
  private async statutCycle(data: Record<string, unknown>, id?: string) {
    if ('statut' in data || !('dateCloture' in data)) return data;
    if (data['dateCloture']) return { ...data, statut: 'BOUCLE' };
    if (!id) return data;
    const existant = await this.prisma.client.cycle.findUnique({
      where: { id },
      select: { statut: true },
    });
    return existant?.statut === 'BOUCLE' ? { ...data, statut: 'EN_COURS' } : data;
  }

  /// `superficie` et `volume` sont dérivés des dimensions par la fonction du
  /// paquet partagé — la même que le mobile. Sans ce calcul, les colonnes
  /// restent nulles et densité, charge et rendement valent `null`.
  private async dimensions(data: Record<string, unknown>, id?: string) {
    const existante = id
      ? ((await this.prisma.client.infrastructure.findUnique({
          where: { id },
          select: {
            longueur: true,
            largeur: true,
            diametre: true,
            profondeur: true,
            niveauRemplissage: true,
            typeInfrastructureId: true,
          },
        })) ?? undefined)
      : undefined;

    const typeId = (data['typeInfrastructureId'] ?? existante?.typeInfrastructureId) as
      | string
      | undefined;
    if (!typeId) return data;

    const type = await this.prisma.client.typeInfrastructure.findUnique({
      where: { id: typeId },
      select: { forme: true },
    });
    if (!type) return data;

    const valeur = (champ: string) =>
      champ in data
        ? nombre(data[champ])
        : nombre(existante?.[champ as keyof typeof existante] ?? null);

    const { superficie, volume } = dimensionsCalculees({
      forme: type.forme,
      longueur: valeur('longueur'),
      largeur: valeur('largeur'),
      diametre: valeur('diametre'),
      profondeur: valeur('profondeur'),
      niveauRemplissage: valeur('niveauRemplissage'),
    });

    return { ...data, superficie, volume };
  }

  /// `finDelaiAttente` = date du traitement + délai d'attente du produit.
  /// Toute récolte antérieure est signalée non conforme : c'est une règle de
  /// sécurité sanitaire des aliments, pas un confort d'affichage.
  ///
  /// Une date envoyée par le client n'est retenue que sans produit du
  /// référentiel : sinon, avancer la fin du délai suffirait à rendre conforme
  /// une récolte qui ne l'est pas.
  private async delaiAttente(data: Record<string, unknown>, id?: string) {
    const existant = id
      ? ((await this.prisma.client.traitement.findUnique({
          where: { id },
          select: { dateOperation: true, produitSanitaireId: true },
        })) ?? undefined)
      : undefined;

    const dateOperation = (data['dateOperation'] ?? existant?.dateOperation) as Date | undefined;
    const produitId = (data['produitSanitaireId'] ?? existant?.produitSanitaireId) as
      | string
      | null
      | undefined;
    if (!dateOperation || !produitId) return data;

    const produit = await this.prisma.client.produitSanitaire.findUnique({
      where: { id: produitId },
      select: { delaiAttenteJours: true },
    });
    if (!produit) return data;

    const fin = ajouterJours(dateOperation.toISOString().slice(0, 10), produit.delaiAttenteJours);
    return { ...data, finDelaiAttente: new Date(`${fin}T00:00:00.000Z`) };
  }
}
