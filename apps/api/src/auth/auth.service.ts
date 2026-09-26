import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { ulid } from 'ulid';
import { z } from 'zod';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ContenuJeton } from './garde.js';
import { EMPREINTE_LEURRE, hacher, verifier } from './mot-de-passe.js';

const DUREE_ACCES_S = 15 * 60;
const DUREE_RAFRAICHISSEMENT_MS = 90 * 24 * 3600 * 1000;
/// Réponse perdue sur un réseau instable : le client rejoue l'ancien jeton.
/// Dans cette fenêtre, ce n'est pas un vol (D18).
const GRACE_REJEU_MS = 60 * 1000;

const appareil = z
  .object({
    /// ULID engendré par le téléphone (D3) : il se reconnaît d'une connexion à l'autre.
    id: z.string().min(10).max(40).optional(),
    libelle: z.string().max(100).optional(),
    plateforme: z.string().max(50).optional(),
  })
  .optional();

/// Chiffres seulement, `+` initial conservé : « 76 12 34 56 » et « 76123456 »
/// désignent le même compte.
const telephone = z
  .string()
  .transform((t) => t.trim().replace(/(?!^\+)[^\d]/g, ''))
  .refine((t) => /^\+?\d{8,15}$/.test(t), 'Numéro de téléphone invalide.');

const inscription = z.object({
  nom: z.string().trim().min(1).max(100),
  prenom: z.string().trim().max(100).optional(),
  telephone,
  email: z.string().trim().toLowerCase().email().optional(),
  motDePasse: z.string().min(8, 'Au moins 8 caractères.').max(200),
  appareil,
});

const connexion = z.object({
  /// Téléphone ou e-mail.
  identifiant: z.string().trim().min(1),
  motDePasse: z.string().min(1).max(200),
  appareil,
});

const jeton = z.object({ jetonRafraichissement: z.string().min(20) });

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

const empreinte = (brut: string) => createHash('sha256').update(brut).digest('hex');

const REFUS = () =>
  new UnauthorizedException({ code: 'IDENTIFIANTS_INVALIDES', message: 'Identifiant ou mot de passe incorrect.' });
const SESSION_TERMINEE = () =>
  new UnauthorizedException({ code: 'SESSION_TERMINEE', message: 'Session terminée, reconnectez-vous.' });

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /// Inscription libre d'un particulier (D19) : toujours PISCICULTEUR. Les
  /// rôles d'encadrement ne s'obtiennent que par un administrateur.
  async inscrire(corps: unknown) {
    const d = lire(inscription, corps);
    const existe = await this.prisma.client.user.findFirst({
      where: { OR: [{ telephone: d.telephone }, ...(d.email ? [{ email: d.email }] : [])] },
      select: { id: true },
    });
    if (existe) {
      throw new ConflictException({ code: 'COMPTE_EXISTANT', message: 'Un compte existe déjà avec ce numéro ou cet e-mail.' });
    }
    const user = await this.prisma.client.user.create({
      data: {
        nom: d.nom,
        prenom: d.prenom ?? null,
        telephone: d.telephone,
        email: d.email ?? null,
        motDePasse: await hacher(d.motDePasse),
        role: 'PISCICULTEUR',
        derniereConnexion: new Date(),
      },
    });
    return this.ouvrirSession(user, d.appareil);
  }

  async connecter(corps: unknown) {
    const d = lire(connexion, corps);
    const identifiant = d.identifiant.includes('@')
      ? { email: d.identifiant.toLowerCase() }
      : { telephone: telephone.safeParse(d.identifiant).data ?? d.identifiant };
    const user = await this.prisma.client.user.findFirst({ where: identifiant });

    const ok = await verifier(d.motDePasse, user?.motDePasse ?? EMPREINTE_LEURRE);
    if (!user || !user.motDePasse || !ok || !user.actif) throw REFUS();

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { derniereConnexion: new Date() },
    });
    return this.ouvrirSession(user, d.appareil);
  }

  async rafraichir(corps: unknown) {
    const { jetonRafraichissement } = lire(jeton, corps);
    const maintenant = Date.now();
    const ligne = await this.prisma.client.jetonRafraichissement.findUnique({
      where: { empreinte: empreinte(jetonRafraichissement) },
      include: { user: true },
    });
    if (!ligne || ligne.revoqueLe || ligne.expireLe.getTime() <= maintenant || !ligne.user.actif) {
      throw SESSION_TERMINEE();
    }

    if (ligne.remplaceLe) {
      if (maintenant - ligne.remplaceLe.getTime() > GRACE_REJEU_MS) {
        // Jeton déjà remplacé puis rejoué : quelqu'un d'autre le détient.
        await this.revoquerFamille(ligne.famille);
        throw SESSION_TERMINEE();
      }
    } else {
      await this.prisma.client.jetonRafraichissement.update({
        where: { id: ligne.id },
        data: { remplaceLe: new Date(maintenant) },
      });
    }
    return this.emettre(ligne.user, ligne.appareilId, ligne.famille);
  }

  /// Révoque la connexion de cet appareil, pas celles des autres.
  async deconnecter(corps: unknown) {
    const { jetonRafraichissement } = lire(jeton, corps);
    const ligne = await this.prisma.client.jetonRafraichissement.findUnique({
      where: { empreinte: empreinte(jetonRafraichissement) },
      select: { famille: true },
    });
    if (ligne) await this.revoquerFamille(ligne.famille);
    return { ok: true };
  }

  async moi(userId: string) {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user || !user.actif) throw SESSION_TERMINEE();
    return profil(user);
  }

  private revoquerFamille(famille: string) {
    return this.prisma.client.jetonRafraichissement.updateMany({
      where: { famille, revoqueLe: null },
      data: { revoqueLe: new Date() },
    });
  }

  private async ouvrirSession(user: User, a?: z.infer<typeof appareil>) {
    const appareilId = await this.enregistrerAppareil(user.id, a);
    return this.emettre(user, appareilId, ulid());
  }

  private async enregistrerAppareil(userId: string, a?: z.infer<typeof appareil>) {
    if (!a) return null;
    const donnees = { libelle: a.libelle ?? null, plateforme: a.plateforme ?? null };
    if (a.id) {
      const existant = await this.prisma.client.appareil.findUnique({
        where: { id: a.id },
        select: { userId: true },
      });
      if (existant && existant.userId !== userId) {
        throw new BadRequestException({ code: 'APPAREIL_INCONNU', message: 'Appareil rattaché à un autre compte.' });
      }
      if (existant) {
        await this.prisma.client.appareil.update({ where: { id: a.id }, data: donnees });
        return a.id;
      }
    }
    const cree = await this.prisma.client.appareil.create({
      data: { ...(a.id ? { id: a.id } : {}), userId, ...donnees },
    });
    return cree.id;
  }

  private async emettre(user: User, appareilId: string | null, famille: string) {
    const brut = randomBytes(32).toString('base64url');
    await this.prisma.client.jetonRafraichissement.create({
      data: {
        userId: user.id,
        appareilId,
        famille,
        empreinte: empreinte(brut),
        expireLe: new Date(Date.now() + DUREE_RAFRAICHISSEMENT_MS),
      },
    });
    const contenu: ContenuJeton = { sub: user.id, role: user.role, regionId: user.regionId };
    return {
      jetonAcces: await this.jwt.signAsync(contenu, { expiresIn: DUREE_ACCES_S }),
      jetonRafraichissement: brut,
      expireDans: DUREE_ACCES_S,
      appareilId,
      utilisateur: profil(user),
    };
  }
}

function profil(user: User) {
  return {
    id: user.id,
    nom: user.nom,
    prenom: user.prenom,
    telephone: user.telephone,
    email: user.email,
    role: user.role,
    regionId: user.regionId,
  };
}
