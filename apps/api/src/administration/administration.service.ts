import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { hacher } from '../auth/mot-de-passe.js';
import { versDateStockee } from '../common/domaine.js';

export interface Pagination {
  debut: number;
  fin: number;
  tri?: string;
  ordre: 'asc' | 'desc';
}

const ROLES = ['PISCICULTEUR', 'ENCADREUR', 'SECTEUR', 'REGION', 'NATIONAL', 'ADMIN'] as const;
const NIVEAUX = ['PROPRIETAIRE', 'ENCADREUR', 'LECTURE'] as const;
const vide = (v: unknown) => (v === '' ? null : v);

const telephone = z
  .string()
  .transform((t) => t.trim().replace(/(?!^\+)[^\d]/g, ''))
  .refine((t) => /^\+?\d{8,15}$/.test(t), 'Numéro de téléphone invalide.');

const utilisateur = z.object({
  nom: z.string().trim().min(1).max(100),
  prenom: z.preprocess(vide, z.string().trim().max(100).nullish()),
  telephone: z.preprocess(vide, telephone.nullish()),
  email: z.preprocess(vide, z.string().trim().toLowerCase().email().nullish()),
  role: z.enum(ROLES),
  regionId: z.preprocess(vide, z.string().nullish()),
  actif: z.boolean().optional(),
  /// Vide à la modification : le mot de passe ne change pas.
  motDePasse: z.preprocess(vide, z.string().min(8, 'Au moins 8 caractères.').max(200).nullish()),
});

const acces = z.object({
  userId: z.string().min(1),
  fermeId: z.string().min(1),
  niveau: z.enum(NIVEAUX),
  debutLe: z.preprocess(vide, z.string().nullish()),
  finLe: z.preprocess(vide, z.string().nullish()),
});

function lire<T>(schema: z.ZodType<T>, corps: unknown): T {
  const r = schema.safeParse(corps);
  if (!r.success) {
    throw new BadRequestException({
      code: 'CHAMPS_INVALIDES',
      message: r.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`).join(' ; '),
    });
  }
  return r.data;
}

/// Jamais renvoyé : ni l'empreinte du mot de passe, ni les jetons.
const PROFIL = {
  id: true, nom: true, prenom: true, telephone: true, email: true, role: true,
  regionId: true, actif: true, derniereConnexion: true, createdAt: true, updatedAt: true,
  region: { select: { nom: true } },
  _count: { select: { acces: true } },
} as const;

/// Administration des comptes, des affectations et des conflits (étape 6).
/// Réservée au rôle ADMIN par le contrôleur.
@Injectable()
export class AdministrationService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  // ---------------------------------------------------------------------------
  //  Utilisateurs
  // ---------------------------------------------------------------------------

  async listerUtilisateurs(p: Pagination, filtres: { q?: string; role?: string; actif?: string }) {
    const where = {
      ...(filtres.role ? { role: filtres.role as (typeof ROLES)[number] } : {}),
      ...(filtres.actif === 'true' ? { actif: true } : filtres.actif === 'false' ? { actif: false } : {}),
      ...(filtres.q
        ? {
            OR: ['nom', 'prenom', 'telephone', 'email'].map((c) => ({
              [c]: { contains: filtres.q, mode: 'insensitive' as const },
            })),
          }
        : {}),
    };
    const [lignes, total] = await Promise.all([
      this.db.user.findMany({
        where,
        select: PROFIL,
        skip: p.debut,
        take: Math.max(p.fin - p.debut, 0),
        orderBy: { [p.tri ?? 'nom']: p.ordre },
      }),
      this.db.user.count({ where }),
    ]);
    return { lignes, total };
  }

  async lireUtilisateur(id: string) {
    const u = await this.db.user.findUnique({ where: { id }, select: PROFIL });
    if (!u) throw new NotFoundException(`utilisateurs/${id} introuvable`);
    return u;
  }

  async creerUtilisateur(corps: unknown) {
    const d = lire(utilisateur, corps);
    if (!d.telephone && !d.email) {
      throw new BadRequestException({ code: 'CHAMPS_INVALIDES', message: 'Un téléphone ou un e-mail est nécessaire pour se connecter.' });
    }
    if (!d.motDePasse) {
      throw new BadRequestException({ code: 'CHAMPS_INVALIDES', message: 'Mot de passe initial obligatoire (8 caractères au moins).' });
    }
    await this.unique(d.telephone ?? null, d.email ?? null);
    const cree = await this.db.user.create({
      data: {
        nom: d.nom, prenom: d.prenom ?? null, telephone: d.telephone ?? null, email: d.email ?? null,
        role: d.role, regionId: d.regionId ?? null, actif: d.actif ?? true,
        motDePasse: await hacher(d.motDePasse),
      },
    });
    return this.lireUtilisateur(cree.id);
  }

  async modifierUtilisateur(id: string, corps: unknown) {
    await this.lireUtilisateur(id);
    const d = lire(utilisateur.partial({ nom: true, role: true }), corps);
    await this.unique(d.telephone ?? null, d.email ?? null, id);
    await this.db.user.update({
      where: { id },
      data: {
        ...(d.nom !== undefined ? { nom: d.nom } : {}),
        ...(d.prenom !== undefined ? { prenom: d.prenom } : {}),
        ...(d.telephone !== undefined ? { telephone: d.telephone } : {}),
        ...(d.email !== undefined ? { email: d.email } : {}),
        ...(d.role !== undefined ? { role: d.role } : {}),
        ...(d.regionId !== undefined ? { regionId: d.regionId } : {}),
        ...(d.actif !== undefined ? { actif: d.actif } : {}),
        ...(d.motDePasse ? { motDePasse: await hacher(d.motDePasse) } : {}),
      },
    });
    // Mot de passe changé ou compte désactivé : les sessions ouvertes tombent.
    // Le jeton d'accès en cours vit encore au plus 15 minutes (D18).
    if (d.motDePasse || d.actif === false) await this.revoquer(id);
    return this.lireUtilisateur(id);
  }

  /// Pas de suppression : les saisies et les conflits gardent leur auteur.
  async desactiverUtilisateur(id: string) {
    await this.lireUtilisateur(id);
    await this.db.user.update({ where: { id }, data: { actif: false } });
    await this.revoquer(id);
    return this.lireUtilisateur(id);
  }

  private revoquer(userId: string) {
    return this.db.jetonRafraichissement.updateMany({
      where: { userId, revoqueLe: null },
      data: { revoqueLe: new Date() },
    });
  }

  private async unique(telephone: string | null, email: string | null, sauf?: string) {
    const conditions = [...(telephone ? [{ telephone }] : []), ...(email ? [{ email }] : [])];
    if (conditions.length === 0) return;
    const autre = await this.db.user.findFirst({
      where: { OR: conditions, ...(sauf ? { id: { not: sauf } } : {}) },
      select: { id: true },
    });
    if (autre) {
      throw new ConflictException({ code: 'COMPTE_EXISTANT', message: 'Ce téléphone ou cet e-mail est déjà utilisé.' });
    }
  }

  // ---------------------------------------------------------------------------
  //  Affectations aux fermes (AccesFerme)
  // ---------------------------------------------------------------------------

  private readonly inclusAcces = {
    user: { select: { nom: true, prenom: true, telephone: true, role: true } },
    ferme: { select: { nom: true } },
  } as const;

  async listerAcces(p: Pagination, filtres: { userId?: string; fermeId?: string; niveau?: string }) {
    const where = {
      ...(filtres.userId ? { userId: filtres.userId } : {}),
      ...(filtres.fermeId ? { fermeId: filtres.fermeId } : {}),
      ...(filtres.niveau ? { niveau: filtres.niveau as (typeof NIVEAUX)[number] } : {}),
    };
    const [lignes, total] = await Promise.all([
      this.db.accesFerme.findMany({
        where,
        include: this.inclusAcces,
        skip: p.debut,
        take: Math.max(p.fin - p.debut, 0),
        orderBy: { [p.tri ?? 'createdAt']: p.ordre },
      }),
      this.db.accesFerme.count({ where }),
    ]);
    return { lignes, total };
  }

  async lireAcces(id: string) {
    const a = await this.db.accesFerme.findUnique({ where: { id }, include: this.inclusAcces });
    if (!a) throw new NotFoundException(`acces/${id} introuvable`);
    return a;
  }

  async creerAcces(corps: unknown) {
    const d = lire(acces, corps);
    const cree = await this.db.accesFerme.create({
      data: {
        userId: d.userId, fermeId: d.fermeId, niveau: d.niveau,
        debutLe: versDateStockee(d.debutLe), finLe: versDateStockee(d.finLe),
      },
    });
    return this.lireAcces(cree.id);
  }

  async modifierAcces(id: string, corps: unknown) {
    await this.lireAcces(id);
    const d = lire(acces.partial(), corps);
    await this.db.accesFerme.update({
      where: { id },
      data: {
        ...(d.niveau ? { niveau: d.niveau } : {}),
        ...(d.debutLe !== undefined ? { debutLe: versDateStockee(d.debutLe) } : {}),
        ...(d.finLe !== undefined ? { finLe: versDateStockee(d.finLe) } : {}),
      },
    });
    return this.lireAcces(id);
  }

  /// Retrait immédiat : les droits sont relus à chaque requête (D18). Le
  /// téléphone garde ce qu'il a déjà reçu (D21, limite connue).
  async supprimerAcces(id: string) {
    await this.lireAcces(id);
    await this.db.accesFerme.delete({ where: { id } });
    return { id };
  }

  // ---------------------------------------------------------------------------
  //  Conflits de synchronisation (D8, D21)
  // ---------------------------------------------------------------------------

  async listerConflits(p: Pagination, filtres: { resolu?: string; tableCible?: string }) {
    const where = {
      ...(filtres.resolu === 'true' ? { resolu: true } : filtres.resolu === 'false' ? { resolu: false } : {}),
      ...(filtres.tableCible ? { tableCible: filtres.tableCible } : {}),
    };
    const [lignes, total] = await Promise.all([
      this.db.conflitSync.findMany({
        where,
        skip: p.debut,
        take: Math.max(p.fin - p.debut, 0),
        orderBy: { [p.tri ?? 'createdAt']: p.tri ? p.ordre : 'desc' },
      }),
      this.db.conflitSync.count({ where }),
    ]);
    // Auteur et appareil lisibles, sans relation Prisma sur ConflitSync.
    const userIds = [...new Set(lignes.map((l) => l.userId).filter((x): x is string => !!x))];
    const appareilIds = [...new Set(lignes.map((l) => l.appareilId).filter((x): x is string => !!x))];
    const [users, appareils] = await Promise.all([
      this.db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nom: true, prenom: true } }),
      this.db.appareil.findMany({ where: { id: { in: appareilIds } }, select: { id: true, libelle: true } }),
    ]);
    const nomUser = new Map(users.map((u) => [u.id, [u.prenom, u.nom].filter(Boolean).join(' ')]));
    const nomAppareil = new Map(appareils.map((a) => [a.id, a.libelle]));
    return {
      lignes: lignes.map((l) => ({
        ...l,
        auteur: l.userId ? (nomUser.get(l.userId) ?? null) : null,
        appareil: l.appareilId ? (nomAppareil.get(l.appareilId) ?? null) : null,
      })),
      total,
    };
  }

  async marquerConflit(id: string, corps: unknown) {
    const { resolu } = lire(z.object({ resolu: z.boolean() }), corps);
    const c = await this.db.conflitSync.findUnique({ where: { id } });
    if (!c) throw new NotFoundException(`conflits/${id} introuvable`);
    return this.db.conflitSync.update({ where: { id }, data: { resolu } });
  }
}
