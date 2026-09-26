import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { SaisieService } from '../saisie/saisie.service.js';
import { RESSOURCES, estRessourceSaisie, versFerme, type SegmentSaisie } from '../saisie/saisie.config.js';
import { RESSOURCES as REFERENTIELS } from '../referentiels/referentiels.service.js';
import { traduireErreurPrisma } from '../common/prisma-exception.filter.js';
import { versSortie } from '../common/domaine.js';
import type { UtilisateurConnecte } from '../auth/garde.js';

/// Ordre parent → enfant. Le pull le suit pour qu'un client puisse insérer
/// dans l'ordre reçu sans violer ses propres clés étrangères.
const ORDRE: SegmentSaisie[] = [
  'fermes', 'infrastructures', 'cycles', 'lots', 'mortalites', 'pesees',
  'echantillons', 'distributions', 'traitements', 'recoltes', 'depenses', 'mesures-eau',
];

/// Recouvrement du curseur. `updatedAt` est posé par l'API au début d'une
/// écriture, la ligne n'est visible qu'au commit : une transaction lente
/// passerait entre deux pulls. On relit donc la dernière minute — les
/// doublons sont sans danger, le client écrit par identifiant.
const RECOUVREMENT_MS = 60_000;

const MAX_CHANGEMENTS = 1000;

const changement = z.object({
  ressource: z.string(),
  id: z.string().min(1).max(40),
  operation: z.enum(['ecrire', 'supprimer']),
  donnees: z.record(z.string(), z.unknown()).optional(),
  /// `updatedAt` de la ligne tel que reçu au dernier pull. Absent : le
  /// client n'a jamais vu de version serveur (création hors ligne).
  versionBase: z.string().datetime().nullish(),
  /// Heure de la modification sur le téléphone. Sert à départager un conflit.
  modifieLe: z.string().datetime().nullish(),
});

const push = z.object({
  appareilId: z.string().max(40).optional(),
  changements: z.array(changement).max(MAX_CHANGEMENTS),
});

type Changement = z.infer<typeof changement>;

export interface Resultat {
  ressource: string;
  id: string;
  statut: 'applique' | 'conflit' | 'rejete';
  /// Pour un conflit : quelle version est désormais en base.
  gagnant?: 'client' | 'serveur';
  code?: string;
  message?: string;
  /// `updatedAt` serveur après application : nouvelle `versionBase` du client.
  version?: string;
}

/// Égalité des champs envoyés avec la ligne serveur, après passage par la
/// même frontière de sortie. Sert à reconnaître un push rejoué.
function identique(donnees: Record<string, unknown>, serveur: Record<string, unknown>) {
  const s = versSortie(serveur) as Record<string, unknown>;
  const normal = (v: unknown) =>
    typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v ?? null;
  return Object.entries(donnees).every(
    ([cle, v]) =>
      ['id', 'createdAt', 'updatedAt', 'deletedAt'].includes(cle) ||
      JSON.stringify(normal(v)) === JSON.stringify(normal(s[cle])),
  );
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly saisie: SaisieService,
  ) {}

  private get db() {
    return this.prisma.client as unknown as Record<string, { findMany(a: unknown): Promise<Record<string, unknown>[]> }>;
  }

  // ---------------------------------------------------------------------------
  //  Pull
  // ---------------------------------------------------------------------------

  async pull(u: UtilisateurConnecte, depuis?: string, appareilId?: string) {
    const maintenant = new Date();
    let borne: Date | null = null;
    if (depuis) {
      const t = Date.parse(depuis);
      if (Number.isNaN(t)) {
        throw new BadRequestException({ code: 'CURSEUR_INVALIDE', message: 'Curseur de synchronisation illisible.' });
      }
      borne = new Date(t - RECOUVREMENT_MS);
    }

    // Une ferme confiée après le dernier pull arrive en entier : ses lignes
    // sont antérieures au curseur et ne sortiraient jamais sinon.
    const nouvelles = borne
      ? (
          await this.prisma.client.accesFerme.findMany({
            where: { userId: u.id, createdAt: { gt: borne } },
            select: { fermeId: true },
          })
        ).map((a) => a.fermeId)
      : [];

    const saisie: Record<string, { modifies: unknown[]; supprimes: string[] }> = {};
    for (const ressource of ORDRE) {
      const portee = this.saisie.porteeLecture(ressource, u);
      const where = borne
        ? {
            AND: [
              portee,
              {
                OR: [
                  { updatedAt: { gt: borne } },
                  ...(nouvelles.length ? [versFerme(ressource, { id: { in: nouvelles } })] : []),
                ],
              },
            ],
            // Les suppressions voyagent aussi : on neutralise le filtre par défaut.
            deletedAt: undefined,
          }
        : { AND: [portee] };
      const lignes = await this.db[RESSOURCES[ressource].modele]!.findMany({
        where,
        orderBy: { updatedAt: 'asc' },
      });
      saisie[ressource] = {
        modifies: lignes.filter((l) => !l['deletedAt']),
        supprimes: lignes.filter((l) => l['deletedAt']).map((l) => String(l['id'])),
      };
    }

    // Référentiels et géographie : tout le monde les lit, la PWA en a besoin
    // hors ligne. Un référentiel désactivé arrive avec `actif: false`.
    const depuisBorne = borne ? { where: { updatedAt: { gt: borne } } } : {};
    const referentiels: Record<string, unknown[]> = {};
    for (const [segment, modele] of Object.entries(REFERENTIELS)) {
      referentiels[segment] = await this.db[modele]!.findMany(depuisBorne);
    }
    const geographie = {
      regions: await this.db['region']!.findMany(depuisBorne),
      cercles: await this.db['cercle']!.findMany(depuisBorne),
      communes: await this.db['commune']!.findMany(depuisBorne),
    };

    await this.noterSync(u, appareilId, maintenant);
    return { curseur: maintenant.toISOString(), saisie, referentiels, geographie };
  }

  private async appareilDe(u: UtilisateurConnecte, appareilId?: string) {
    if (!appareilId) return null;
    const a = await this.prisma.client.appareil.findFirst({
      where: { id: appareilId, userId: u.id },
      select: { id: true },
    });
    return a?.id ?? null;
  }

  private async noterSync(u: UtilisateurConnecte, appareilId: string | undefined, quand: Date) {
    const id = await this.appareilDe(u, appareilId);
    if (id) await this.prisma.client.appareil.update({ where: { id }, data: { derniereSyncAt: quand } });
  }

  // ---------------------------------------------------------------------------
  //  Push
  // ---------------------------------------------------------------------------

  /// Chaque changement est appliqué seul, dans l'ordre reçu (celui du journal
  /// local : un parent créé avant ses enfants). Un refus n'arrête pas le lot —
  /// il est renvoyé avec son code pour que l'agent corrige cette ligne-là.
  async push(u: UtilisateurConnecte, corps: unknown) {
    const lu = push.safeParse(corps);
    if (!lu.success) {
      throw new BadRequestException({
        code: 'CHAMPS_INVALIDES',
        message: lu.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`).join(' ; '),
      });
    }
    const appareilId = await this.appareilDe(u, lu.data.appareilId);
    const resultats: Resultat[] = [];
    for (const c of lu.data.changements) {
      resultats.push(await this.appliquer(u, c, appareilId));
    }
    await this.noterSync(u, appareilId ?? undefined, new Date());
    return { resultats };
  }

  private async appliquer(u: UtilisateurConnecte, c: Changement, appareilId: string | null): Promise<Resultat> {
    const base = { ressource: c.ressource, id: c.id };
    if (!estRessourceSaisie(c.ressource)) {
      return { ...base, statut: 'rejete', code: 'RESSOURCE_INCONNUE', message: `Ressource inconnue : ${c.ressource}` };
    }
    const ressource = c.ressource;
    try {
      const serveur = await this.saisie.brute(ressource, c.id);
      return c.operation === 'ecrire'
        ? await this.ecrire(u, ressource, c, serveur, appareilId)
        : await this.supprimer(u, ressource, c, serveur, appareilId);
    } catch (e) {
      return { ...base, statut: 'rejete', ...this.refus(e) };
    }
  }

  private refus(e: unknown): { code: string; message: string } {
    if (e instanceof HttpException) {
      const r = e.getResponse();
      const corps = (typeof r === 'object' ? r : { message: r }) as { code?: string; message?: unknown };
      return {
        code: corps.code ?? `HTTP_${e.getStatus()}`,
        message: Array.isArray(corps.message) ? corps.message.join(' ') : String(corps.message ?? e.message),
      };
    }
    const prisma = traduireErreurPrisma(e);
    if (prisma) return { code: prisma.code, message: prisma.message };
    throw e;
  }

  /// Heure du client, bornée à l'heure du serveur : un téléphone réglé dans
  /// le futur gagnerait sinon tous les conflits pendant des mois.
  private heureClient(c: Changement, maintenant: Date) {
    const t = c.modifieLe ? Date.parse(c.modifieLe) : maintenant.getTime();
    return Math.min(t, maintenant.getTime());
  }

  private async ecrire(
    u: UtilisateurConnecte,
    ressource: SegmentSaisie,
    c: Changement,
    serveur: Awaited<ReturnType<SaisieService['brute']>>,
    appareilId: string | null,
  ): Promise<Resultat> {
    const base = { ressource, id: c.id };
    const donnees = c.donnees ?? {};

    if (!serveur) {
      const cree = (await this.saisie.creer(ressource, { ...donnees, id: c.id }, u)) as { updatedAt: Date };
      return { ...base, statut: 'applique', version: cree.updatedAt.toISOString() };
    }
    if (!(await this.saisie.peutEcrire(ressource, c.id, u))) {
      return { ...base, statut: 'rejete', code: 'LIGNE_INTROUVABLE', message: `${ressource}/${c.id} introuvable` };
    }
    if (serveur.deletedAt) {
      await this.journaliser(u, appareilId, ressource, c.id, donnees, serveur, 'LIGNE_SUPPRIMEE');
      return { ...base, statut: 'conflit', gagnant: 'serveur', code: 'LIGNE_SUPPRIMEE', message: 'Cette ligne a été supprimée entre-temps.' };
    }
    // Push rejoué après une réponse perdue : rien à faire, et surtout pas un conflit.
    if (identique(donnees, serveur)) {
      return { ...base, statut: 'applique', version: serveur.updatedAt.toISOString() };
    }

    const conflit = !c.versionBase || serveur.updatedAt.getTime() > Date.parse(c.versionBase);
    if (!conflit) {
      const maj = (await this.saisie.modifier(ressource, c.id, donnees, u)) as { updatedAt: Date };
      return { ...base, statut: 'applique', version: maj.updatedAt.toISOString() };
    }

    // D8 : la dernière écriture gagne, la valeur écartée est journalisée.
    if (this.heureClient(c, new Date()) >= serveur.updatedAt.getTime()) {
      const maj = (await this.saisie.modifier(ressource, c.id, donnees, u)) as Record<string, unknown> & { updatedAt: Date };
      await this.journaliser(u, appareilId, ressource, c.id, serveur, maj, 'DERNIERE_ECRITURE_CLIENT');
      return { ...base, statut: 'conflit', gagnant: 'client', version: maj.updatedAt.toISOString() };
    }
    await this.journaliser(u, appareilId, ressource, c.id, donnees, serveur, 'DERNIERE_ECRITURE_SERVEUR');
    return { ...base, statut: 'conflit', gagnant: 'serveur', version: serveur.updatedAt.toISOString() };
  }

  private async supprimer(
    u: UtilisateurConnecte,
    ressource: SegmentSaisie,
    c: Changement,
    serveur: Awaited<ReturnType<SaisieService['brute']>>,
    appareilId: string | null,
  ): Promise<Resultat> {
    const base = { ressource, id: c.id };
    // Créée puis supprimée hors ligne, ou déjà supprimée : le résultat voulu est atteint.
    if (!serveur || serveur.deletedAt) return { ...base, statut: 'applique' };
    if (!(await this.saisie.peutEcrire(ressource, c.id, u))) {
      return { ...base, statut: 'rejete', code: 'LIGNE_INTROUVABLE', message: `${ressource}/${c.id} introuvable` };
    }
    const modifieeDepuis = !!c.versionBase && serveur.updatedAt.getTime() > Date.parse(c.versionBase);
    if (modifieeDepuis && this.heureClient(c, new Date()) < serveur.updatedAt.getTime()) {
      // Modifiée ailleurs après la suppression locale : on garde la modification.
      await this.journaliser(u, appareilId, ressource, c.id, { suppression: true }, serveur, 'MODIFIEE_APRES_SUPPRESSION');
      return { ...base, statut: 'conflit', gagnant: 'serveur', version: serveur.updatedAt.toISOString() };
    }
    const supprimee = (await this.saisie.supprimer(ressource, c.id, u)) as { updatedAt: Date };
    return { ...base, statut: 'applique', version: supprimee.updatedAt.toISOString() };
  }

  private journaliser(
    u: UtilisateurConnecte,
    appareilId: string | null,
    ressource: SegmentSaisie,
    id: string,
    rejetee: Record<string, unknown>,
    retenue: Record<string, unknown>,
    raison: string,
  ) {
    return this.prisma.client.conflitSync.create({
      data: {
        tableCible: RESSOURCES[ressource].modele,
        enregistrement: id,
        appareilId,
        userId: u.id,
        valeurRejetee: versSortie(rejetee) as object,
        valeurRetenue: versSortie(retenue) as object,
        raison,
      },
    });
  }
}
