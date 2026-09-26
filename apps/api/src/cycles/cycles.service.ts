import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { calculerIndicateurs, type CycleComplet } from '@aqua/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UtilisateurConnecte } from '../auth/garde.js';
import { fermesLisibles } from '../auth/portee.js';

/// Frontière du domaine. `calculerIndicateurs` attend des nombres et des dates
/// « AAAA-MM-JJ » : un `Prisma.Decimal` laissé tel quel concatène au lieu
/// d'additionner, et une `Date` fait échouer les comparaisons de dates.
type Chiffre = Prisma.Decimal | number | null;

function nb(valeur: Exclude<Chiffre, null>): number {
  return typeof valeur === 'number' ? valeur : valeur.toNumber();
}

function nbOuNul(valeur: Chiffre): number | null {
  return valeur === null ? null : nb(valeur);
}

function jour(valeur: Date): string {
  return valeur.toISOString().slice(0, 10);
}

const vivant = { deletedAt: null };

function jourOuNul(valeur: Date | null): string | null {
  return valeur === null ? null : jour(valeur);
}

@Injectable()
export class CyclesService {
  constructor(private readonly prisma: PrismaService) {}

  /// Charge l'agrégat complet puis délègue le calcul. La fonction de calcul ne
  /// lit rien elle-même (D13) : c'est ce qui la rend rejouable sur le téléphone
  /// à partir du cache local.
  async indicateurs(cycleId: string, u: UtilisateurConnecte) {
    const ferme = fermesLisibles(u);
    const cycle = await this.prisma.client.cycle.findFirst({
      where: { id: cycleId, ...(ferme ? { infrastructure: { ferme } } : {}) },
      // L'extension de suppression douce ne filtre que le premier niveau :
      // chaque relation incluse doit écarter elle-même ses lignes supprimées,
      // sans quoi une pesée effacée compte encore dans les indicateurs.
      include: {
        infrastructure: { include: { typeInfrastructure: true } },
        lots: { where: vivant, include: { mortalites: { where: vivant } } },
        pesees: { where: vivant, include: { echantillons: { where: vivant } } },
        distributions: { where: vivant },
        traitements: { where: vivant },
        recoltes: { where: vivant },
        depenses: { where: vivant },
      },
    });
    if (!cycle) throw new NotFoundException(`Cycle ${cycleId} introuvable`);

    const especeIds = [
      ...new Set(
        [...cycle.lots.map((l) => l.especeId), cycle.especeId].filter(
          (v): v is string => v !== null,
        ),
      ),
    ];
    const especes = await this.prisma.client.espece.findMany({ where: { id: { in: especeIds } } });

    const agregat: CycleComplet = {
      cycle: {
        id: cycle.id,
        numero: cycle.numero,
        dateMiseEnCharge: jour(cycle.dateMiseEnCharge),
        dateCloture: jourOuNul(cycle.dateCloture),
        statut: cycle.statut,
        especeId: cycle.especeId,
      },
      infrastructure: {
        id: cycle.infrastructure.id,
        nom: cycle.infrastructure.nom,
        mesureBase: cycle.infrastructure.typeInfrastructure.mesureBase,
        forme: cycle.infrastructure.typeInfrastructure.forme,
        longueur: nbOuNul(cycle.infrastructure.longueur),
        largeur: nbOuNul(cycle.infrastructure.largeur),
        diametre: nbOuNul(cycle.infrastructure.diametre),
        profondeur: nbOuNul(cycle.infrastructure.profondeur),
        niveauRemplissage: nb(cycle.infrastructure.niveauRemplissage),
        superficie: nbOuNul(cycle.infrastructure.superficie),
        volume: nbOuNul(cycle.infrastructure.volume),
      },
      lots: cycle.lots.map((l) => ({
        id: l.id,
        especeId: l.especeId,
        nombre: l.nombre,
        poidsMoyenG: nb(l.poidsMoyenG),
        coutUnitaire: nb(l.coutUnitaire),
        dateMiseEnCharge: jour(l.dateMiseEnCharge),
      })),
      mortalites: cycle.lots.flatMap((l) =>
        l.mortalites.map((m) => ({
          id: m.id,
          lotId: m.lotId,
          dateConstat: jour(m.dateConstat),
          nombre: m.nombre,
          remplacement: m.remplacement,
          coutUnitaire: nbOuNul(m.coutUnitaire),
        })),
      ),
      pesees: cycle.pesees.map((p) => ({
        id: p.id,
        numero: p.numero,
        dateOperation: jour(p.dateOperation),
        tauxRationPct: nbOuNul(p.tauxRationPct),
      })),
      echantillons: cycle.pesees.flatMap((p) =>
        p.echantillons.map((e) => ({
          id: e.id,
          peseeId: e.peseeId,
          lotId: e.lotId,
          numero: e.numero,
          nombre: e.nombre,
          poidsTotalG: nb(e.poidsTotalG),
        })),
      ),
      distributions: cycle.distributions.map((d) => ({
        id: d.id,
        peseeId: d.peseeId,
        alimentId: d.alimentId,
        dateDebut: jour(d.dateDebut),
        quantiteTotaleKg: nb(d.quantiteTotaleKg),
        prixKgApplique: nbOuNul(d.prixKgApplique),
      })),
      traitements: cycle.traitements.map((t) => ({
        id: t.id,
        produitSanitaireId: t.produitSanitaireId,
        dateOperation: jour(t.dateOperation),
        quantite: nbOuNul(t.quantite),
        prixUnitaire: nbOuNul(t.prixUnitaire),
        finDelaiAttente: jourOuNul(t.finDelaiAttente),
      })),
      recoltes: cycle.recoltes.map((r) => ({
        id: r.id,
        lotId: r.lotId,
        especeId: r.especeId,
        dateOperation: jour(r.dateOperation),
        type: r.type,
        poidsKg: nb(r.poidsKg),
        nombre: r.nombre,
        prixKg: nb(r.prixKg),
      })),
      depenses: cycle.depenses.map((d) => ({
        id: d.id,
        categorie: d.categorie,
        montant: nb(d.montant),
        dateOperation: jour(d.dateOperation),
      })),
      especes: especes.map((e) => ({
        id: e.id,
        nom: e.nom,
        codeFao: e.codeFao,
        gainJournalierRef: nbOuNul(e.gainJournalierRef),
        indiceConsommationRef: nbOuNul(e.indiceConsommationRef),
        tauxSurvieRef: nbOuNul(e.tauxSurvieRef),
        temperatureOptMin: nbOuNul(e.temperatureOptMin),
        temperatureOptMax: nbOuNul(e.temperatureOptMax),
        temperatureMin: nbOuNul(e.temperatureMin),
        temperatureMax: nbOuNul(e.temperatureMax),
        oxygeneMin: nbOuNul(e.oxygeneMin),
        densiteMaxM2: nbOuNul(e.densiteMaxM2),
        densiteMaxM3: nbOuNul(e.densiteMaxM3),
      })),
    };

    return calculerIndicateurs(agregat);
  }
}
