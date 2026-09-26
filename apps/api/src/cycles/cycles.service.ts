import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { aujourdhui, calculerAlertes, calculerIndicateurs, type CycleComplet } from '@aqua/shared';
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
    return calculerIndicateurs((await this.charger(cycleId, u)).agregat);
  }

  async alertes(cycleId: string, u: UtilisateurConnecte) {
    const { agregat, mesures } = await this.charger(cycleId, u);
    return calculerAlertes(agregat, { aujourdhui: aujourdhui(), mesures });
  }

  /// Alertes de tous les cycles en cours visibles par l'utilisateur, les plus
  /// graves d'abord. Borné : au-delà, c'est un tableau de bord national, pas
  /// une liste à parcourir.
  async alertesEnCours(u: UtilisateurConnecte) {
    const ferme = fermesLisibles(u);
    const cycles = await this.prisma.client.cycle.findMany({
      where: { dateCloture: null, ...(ferme ? { infrastructure: { ferme } } : {}) },
      select: { id: true, numero: true, infrastructure: { select: { id: true, nom: true, ferme: { select: { id: true, nom: true } } } } },
      orderBy: { dateMiseEnCharge: 'desc' },
      take: 300,
    });
    const rang = { critique: 0, attention: 1, info: 2 } as const;
    const resultat = [];
    for (const c of cycles) {
      const alertes = await this.alertes(c.id, u);
      if (alertes.length === 0) continue;
      resultat.push({
        cycleId: c.id,
        numero: c.numero,
        bassin: c.infrastructure.nom,
        bassinId: c.infrastructure.id,
        ferme: c.infrastructure.ferme.nom,
        fermeId: c.infrastructure.ferme.id,
        alertes,
      });
    }
    return resultat.sort((a, b) => rang[a.alertes[0]!.niveau] - rang[b.alertes[0]!.niveau]);
  }

  /// Consolidation par territoire (étape 6) : chaque cycle est chiffré par
  /// `calculerIndicateurs` — les mêmes chiffres que sa fiche —, puis sommé.
  /// Période : cycles actifs entre `depuis` et `jusqua` (mise en charge avant
  /// la fin de période, clôture après son début ou cycle en cours).
  async consolidation(
    u: UtilisateurConnecte,
    niveau: 'region' | 'cercle' | 'commune',
    depuis?: string,
    jusqua?: string,
  ) {
    const ferme = fermesLisibles(u);
    const jourUtc = (d: string) => new Date(`${d}T00:00:00.000Z`);
    const cycles = await this.prisma.client.cycle.findMany({
      where: {
        ...(ferme ? { infrastructure: { ferme } } : {}),
        ...(jusqua ? { dateMiseEnCharge: { lte: jourUtc(jusqua) } } : {}),
        ...(depuis ? { OR: [{ dateCloture: null }, { dateCloture: { gte: jourUtc(depuis) } }] } : {}),
      },
      select: {
        id: true,
        dateCloture: true,
        infrastructure: {
          select: {
            id: true,
            superficie: true,
            ferme: {
              select: {
                id: true,
                region: { select: { id: true, nom: true } },
                cercle: { select: { id: true, nom: true } },
                commune: { select: { id: true, nom: true } },
              },
            },
          },
        },
      },
      take: 2000,
    });

    type Ligne = {
      territoireId: string | null; territoire: string;
      fermes: Set<string>; bassins: Set<string>; cyclesEnCours: number; cyclesBoucles: number;
      productionKg: number; produits: number; charges: number; resultat: number;
      survies: number[];
    };
    const groupes = new Map<string, Ligne>();
    for (const c of cycles) {
      const f = c.infrastructure.ferme;
      const t = f[niveau];
      const cle = t?.id ?? 'aucun';
      const g = groupes.get(cle) ?? {
        territoireId: t?.id ?? null, territoire: t?.nom ?? 'Non renseigné',
        fermes: new Set(), bassins: new Set(), cyclesEnCours: 0, cyclesBoucles: 0,
        productionKg: 0, produits: 0, charges: 0, resultat: 0, survies: [],
      };
      g.fermes.add(f.id);
      g.bassins.add(c.infrastructure.id);
      if (c.dateCloture) g.cyclesBoucles++;
      else g.cyclesEnCours++;
      const { agregat } = await this.charger(c.id, u);
      if (agregat.lots.length > 0) {
        const i = calculerIndicateurs(agregat);
        g.productionKg += i.production.productionRecolteeKg;
        g.produits += i.economie.produits.total;
        g.charges += i.economie.charges.total;
        g.resultat += i.economie.resultat;
        if (c.dateCloture && i.zootechnie.tauxSurviePct !== null) g.survies.push(i.zootechnie.tauxSurviePct);
      }
      groupes.set(cle, g);
    }

    const arrondi = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
    const lignes = [...groupes.values()]
      .map((g) => ({
        territoireId: g.territoireId,
        territoire: g.territoire,
        fermes: g.fermes.size,
        bassins: g.bassins.size,
        cyclesEnCours: g.cyclesEnCours,
        cyclesBoucles: g.cyclesBoucles,
        productionKg: arrondi(g.productionKg),
        produits: Math.round(g.produits),
        charges: Math.round(g.charges),
        resultat: Math.round(g.resultat),
        prixRevientMoyenKg: g.productionKg > 0 ? Math.round(g.charges / g.productionKg) : null,
        tauxSurvieMoyenPct: g.survies.length ? arrondi(g.survies.reduce((s, x) => s + x, 0) / g.survies.length) : null,
      }))
      .sort((a, b) => b.productionKg - a.productionKg || a.territoire.localeCompare(b.territoire, 'fr'));
    return { niveau, depuis: depuis ?? null, jusqua: jusqua ?? null, tronque: cycles.length === 2000, lignes };
  }

  /// Agrégat du cycle et relevés d'eau, depuis PostgreSQL.
  private async charger(cycleId: string, u: UtilisateurConnecte) {
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
        seuilHeterogeneitePct: nbOuNul(e.seuilHeterogeneitePct),
      })),
    };

    const mesures = (
      await this.prisma.client.mesureEau.findMany({ where: { cycleId }, orderBy: { dateMesure: 'asc' } })
    ).map((m) => ({
      dateMesure: jour(m.dateMesure),
      heure: m.heure,
      temperature: nbOuNul(m.temperature),
      oxygeneDissous: nbOuNul(m.oxygeneDissous),
      ph: nbOuNul(m.ph),
    }));
    return { agregat, mesures };
  }
}
