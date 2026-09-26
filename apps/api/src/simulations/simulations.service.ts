import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { aujourdhui, ErreurSimulation, simuler, type ParametresSimulation } from '@aqua/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { versSortie } from '../common/domaine.js';
import type { UtilisateurConnecte } from '../auth/garde.js';

const positif = z.coerce.number().positive();
const positifOuNul = z.coerce.number().min(0);
const facultatif = (s: z.ZodTypeAny) => z.preprocess((v) => (v === '' || v === null ? undefined : v), s.optional());

const parametres = z.object({
  capital: positifOuNul,
  especeId: z.string().min(1),
  typeInfrastructureId: z.string().min(1),
  taille: positif,
  densite: facultatif(positif),
  poidsInitialG: facultatif(positif),
  poidsCibleG: facultatif(positif),
  prixAlevin: positifOuNul,
  prixAlimentKg: positifOuNul,
  prixVenteKg: positif,
  autresCharges: facultatif(positifOuNul),
  dateDebut: facultatif(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});

const enregistrement = z.object({ nom: z.string().trim().min(1).max(120), parametres });

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

/// Simulation d'un projet (étape 9). Le calcul est celui de `@aqua/shared`
/// — le même que la PWA fait hors ligne ; l'API ne fait que charger les
/// repères de l'espèce et enregistrer.
@Injectable()
export class SimulationsService {
  constructor(private readonly prisma: PrismaService) {}

  async calculer(corps: unknown) {
    const p = lire(parametres, corps) as ParametresSimulation;
    const [espece, type] = await Promise.all([
      this.prisma.client.espece.findUnique({ where: { id: p.especeId } }),
      this.prisma.client.typeInfrastructure.findUnique({ where: { id: p.typeInfrastructureId } }),
    ]);
    // Même frontière que partout : Decimal → nombre (sinon les calculs concatènent).
    const especes = espece ? [versSortie(espece) as never] : [];
    const types = type ? [versSortie(type) as never] : [];
    try {
      return simuler({ ...p, dateDebut: p.dateDebut ?? aujourdhui() }, especes, types);
    } catch (e) {
      if (e instanceof ErreurSimulation) {
        throw new BadRequestException({ code: 'SIMULATION_IMPOSSIBLE', message: e.message });
      }
      throw e;
    }
  }

  async enregistrer(corps: unknown, u: UtilisateurConnecte) {
    const { nom, parametres: p } = lire(enregistrement, corps);
    const { cycleProjete: _, ...resultats } = await this.calculer(p);
    return this.prisma.client.simulation.create({
      data: { nom, userId: u.id, parametres: p as object, resultats: resultats as object },
    });
  }

  /// Chacun ses simulations ; l'administrateur les voit toutes.
  private proprietaire(u: UtilisateurConnecte) {
    return u.role === 'ADMIN' ? {} : { userId: u.id };
  }

  lister(u: UtilisateurConnecte) {
    return this.prisma.client.simulation.findMany({
      where: this.proprietaire(u),
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async lire(id: string, u: UtilisateurConnecte) {
    const s = await this.prisma.client.simulation.findFirst({ where: { id, ...this.proprietaire(u) } });
    if (!s) throw new NotFoundException(`simulations/${id} introuvable`);
    return s;
  }

  async supprimer(id: string, u: UtilisateurConnecte) {
    await this.lire(id, u);
    await this.prisma.client.simulation.delete({ where: { id } });
    return { ok: true };
  }
}
