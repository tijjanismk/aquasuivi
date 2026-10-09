import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { aujourdhui, ErreurSimulation, lireNombre, simuler, type ParametresSimulation } from '@aqua/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { versSortie } from '../common/domaine.js';
import type { UtilisateurConnecte } from '../auth/garde.js';

/// « 12,5 » et « 500 000 » comme on les tape en français : `z.coerce.number()`
/// y lisait NaN, et l'écran affichait « expected number, received NaN ».
const versNombre = (v: unknown) => (typeof v === 'string' ? (v.trim() === '' ? undefined : (lireNombre(v) ?? Number.NaN)) : v);
const nombre = () =>
  z.number({ error: (i) => (i.input === undefined ? 'obligatoire' : 'nombre attendu, par exemple 12,5 ou 500 000') });
const positif = z.preprocess(versNombre, nombre().positive('doit être supérieur à 0'));
const positifOuNul = z.preprocess(versNombre, nombre().min(0, 'ne peut pas être négatif'));
const facultatif = (s: z.ZodTypeAny) => z.preprocess((v) => (v === '' || v === null ? undefined : v), s.optional());
const choix = z.string({ error: 'obligatoire' }).min(1, 'obligatoire');

/// Noms des champs tels que l'écran les affiche, pour des refus lisibles.
const LIBELLES: Record<string, string> = {
  capital: 'Capital disponible',
  especeId: 'Espèce',
  typeInfrastructureId: 'Type de bassin',
  taille: 'Surface ou volume',
  densite: 'Densité',
  poidsInitialG: 'Poids des alevins',
  poidsCibleG: 'Poids de vente visé',
  prixAlevin: 'Prix d’un alevin',
  prixAlimentKg: 'Prix du kilo d’aliment',
  prixVenteKg: 'Prix de vente du kilo',
  autresCharges: 'Autres charges',
  dateDebut: 'Date de début',
  nom: 'Nom',
};

const parametres = z.object({
  capital: positifOuNul,
  especeId: choix,
  typeInfrastructureId: choix,
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
      message: r.error.issues
        .map((i) => {
          const champ = String(i.path.at(-1) ?? '');
          return `${LIBELLES[champ] ?? champ} : ${i.message}`;
        })
        .join(' ; '),
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
