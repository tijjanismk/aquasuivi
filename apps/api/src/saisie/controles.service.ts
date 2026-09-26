import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  aujourdhui,
  controlerCycle,
  controlerDepense,
  controlerDistribution,
  controlerEchantillon,
  controlerInfrastructure,
  controlerLot,
  controlerMesureEau,
  controlerMortalite,
  controlerPesee,
  controlerRecolte,
  controlerTraitement,
  type BornesCycle,
  type Violation,
} from '@aqua/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { versSortie } from '../common/domaine.js';
import type { SegmentSaisie } from './saisie.config.js';

/// Colonnes numériques contrôlées. Un formulaire peut les envoyer en texte ;
/// sans conversion, « 0 » passerait pour une valeur renseignée et positive.
const NUMERIQUES = new Set([
  'longueur', 'largeur', 'diametre', 'profondeur', 'niveauRemplissage',
  'nombre', 'poidsMoyenG', 'coutUnitaire', 'remplacement', 'tauxRationPct',
  'poidsTotalG', 'quantiteTotaleKg', 'rationKgJour', 'prixKgApplique',
  'quantite', 'prixUnitaire', 'poidsKg', 'prixKg', 'montant',
  'temperature', 'oxygeneDissous', 'ph', 'transparenceSecchi', 'ammoniacNh3',
  'nitrites', 'alcalinite', 'salinite',
]);

type Ligne = Record<string, any>;

function normaliser(brut: Record<string, unknown>): Ligne {
  const sortie = versSortie(brut) as Ligne;
  for (const cle of Object.keys(sortie)) {
    const v = sortie[cle];
    if (NUMERIQUES.has(cle) && typeof v === 'string') {
      sortie[cle] = v.trim() === '' ? null : Number(v);
    }
  }
  return sortie;
}

const jour = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

function incoherent(champ: string, message: string): Violation {
  return { code: 'RATTACHEMENT_INCOHERENT', champ, message };
}

/// Charge ce que les contrôles du paquet partagé ne peuvent pas lire eux-mêmes
/// (bornes du cycle, effectifs, cycles voisins), puis les applique. Même règle
/// qu'hors ligne sur la PWA : seule la source du contexte change.
@Injectable()
export class ControlesService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  /// `data` : ce qui va être écrit. `id` : la ligne modifiée, absente à la création.
  async verifier(ressource: SegmentSaisie, data: Record<string, unknown>, id?: string) {
    const existante = id ? await this.existante(ressource, id) : {};
    const l = { ...normaliser(existante), ...normaliser(data) };
    const violations = await this.controler(ressource, l, id);
    if (violations.length > 0) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: violations[0]!.code,
        message: violations.map((v) => v.message).join(' '),
        violations,
      });
    }
  }

  private async existante(ressource: SegmentSaisie, id: string): Promise<Record<string, unknown>> {
    const modele = {
      fermes: 'ferme', infrastructures: 'infrastructure', cycles: 'cycle', lots: 'lot',
      mortalites: 'mortalite', pesees: 'pesee', echantillons: 'echantillon',
      distributions: 'distribution', traitements: 'traitement', recoltes: 'recolte',
      depenses: 'depense', 'mesures-eau': 'mesureEau',
    }[ressource];
    const delegue = (this.db as unknown as Record<string, { findUnique(a: unknown): Promise<unknown> }>)[modele]!;
    const ligne = (await delegue.findUnique({ where: { id } })) as Record<string, unknown> | null;
    if (!ligne) throw new NotFoundException(`${ressource}/${id} introuvable`);
    return ligne;
  }

  private async bornes(cycleId: unknown): Promise<(BornesCycle & { infrastructureId: string }) | null> {
    if (typeof cycleId !== 'string' || !cycleId) return null;
    const c = await this.db.cycle.findUnique({
      where: { id: cycleId },
      select: { dateMiseEnCharge: true, dateCloture: true, infrastructureId: true },
    });
    if (!c) return null;
    return {
      dateMiseEnCharge: jour(c.dateMiseEnCharge)!,
      dateCloture: jour(c.dateCloture),
      infrastructureId: c.infrastructureId,
    };
  }

  private async controler(ressource: SegmentSaisie, l: Ligne, id?: string): Promise<Violation[]> {
    const auj = aujourdhui();
    switch (ressource) {
      case 'fermes':
        return this.territoire(l);
      case 'infrastructures':
        return controlerInfrastructure(l);
      case 'cycles':
        return this.cycle(l, auj, id);
      case 'lots': {
        const b = await this.bornes(l['cycleId']);
        return b ? controlerLot(l, b, auj) : [];
      }
      case 'mortalites':
        return this.mortalite(l, auj, id);
      case 'pesees': {
        const b = await this.bornes(l['cycleId']);
        return b ? controlerPesee(l, b, auj) : [];
      }
      case 'echantillons':
        return this.echantillon(l);
      case 'distributions': {
        const b = await this.bornes(l['cycleId']);
        if (!b) return [];
        const v = controlerDistribution(l, b, auj);
        if (l['peseeId']) v.push(...(await this.memeCycle('pesee', l['peseeId'], l['cycleId'], 'peseeId')));
        return v;
      }
      case 'traitements': {
        const b = await this.bornes(l['cycleId']);
        return b ? controlerTraitement(l, b, auj) : [];
      }
      case 'recoltes':
        return this.recolte(l, auj, id);
      case 'depenses': {
        const b = await this.bornes(l['cycleId']);
        return b ? controlerDepense(l, b, auj) : [];
      }
      case 'mesures-eau':
        return this.mesureEau(l, auj);
    }
  }

  /// Commune dans son cercle, cercle dans sa région : sinon la consolidation
  /// compterait la même ferme dans deux territoires selon le niveau choisi.
  private async territoire(l: Ligne): Promise<Violation[]> {
    const v: Violation[] = [];
    if (l['communeId']) {
      const commune = await this.db.commune.findUnique({ where: { id: String(l['communeId']) }, select: { cercleId: true } });
      if (commune && commune.cercleId !== l['cercleId']) {
        v.push(incoherent('communeId', 'La commune n’appartient pas au cercle choisi.'));
      }
    }
    if (l['cercleId']) {
      const cercle = await this.db.cercle.findUnique({ where: { id: String(l['cercleId']) }, select: { regionId: true } });
      if (cercle && cercle.regionId !== l['regionId']) {
        v.push(incoherent('cercleId', 'Le cercle n’appartient pas à la région choisie.'));
      }
    }
    return v;
  }

  private async memeCycle(modele: 'pesee' | 'lot', idLigne: unknown, cycleId: unknown, champ: string) {
    const ligne = await (modele === 'pesee'
      ? this.db.pesee.findUnique({ where: { id: String(idLigne) }, select: { cycleId: true } })
      : this.db.lot.findUnique({ where: { id: String(idLigne) }, select: { cycleId: true } }));
    return ligne && ligne.cycleId !== cycleId
      ? [incoherent(champ, `Ce${modele === 'lot' ? ' lot' : 'tte pesée'} appartient à un autre cycle.`)]
      : [];
  }

  private async cycle(l: Ligne, auj: string, id?: string): Promise<Violation[]> {
    const infrastructureId = String(l['infrastructureId'] ?? '');
    const infra = await this.db.infrastructure.findUnique({
      where: { id: infrastructureId },
      select: { actif: true },
    });
    const debut = l['dateMiseEnCharge'] as string | undefined;
    const autres = { infrastructureId, ...(id ? { id: { not: id } } : {}) };

    const [precedent, suivant] = debut
      ? await Promise.all([
          this.db.cycle.findFirst({
            where: { ...autres, dateMiseEnCharge: { lte: new Date(`${debut}T00:00:00Z`) } },
            orderBy: { dateMiseEnCharge: 'desc' },
            select: { dateCloture: true },
          }),
          this.db.cycle.findFirst({
            where: { ...autres, dateMiseEnCharge: { gt: new Date(`${debut}T00:00:00Z`) } },
            orderBy: { dateMiseEnCharge: 'asc' },
            select: { dateMiseEnCharge: true },
          }),
        ])
      : [null, null];

    const { premiere, derniere } = id ? await this.operations(id) : { premiere: null, derniere: null };
    const autreCycleOuvert =
      !l['dateCloture'] && (await this.db.cycle.count({ where: { ...autres, dateCloture: null } })) > 0;
    return controlerCycle(
      { ...l, statut: l['statut'] ?? 'EN_COURS' },
      {
        aujourdhui: auj,
        infrastructureActive: infra?.actif ?? true,
        cloturePrecedente: jour(precedent?.dateCloture),
        miseEnChargeSuivante: jour(suivant?.dateMiseEnCharge),
        premiereOperation: premiere,
        derniereOperation: derniere,
        creation: !id,
        autreCycleOuvert,
      },
    );
  }

  /// Première et dernière date d'opération d'un cycle. Les dépenses ne comptent
  /// que pour la dernière : elles peuvent légitimement précéder la mise en charge.
  private async operations(cycleId: string) {
    const parCycle = { cycleId };
    const [lots, morts, pesees, distribDebut, distribFin, traitements, recoltes, mesures, depenses] =
      await Promise.all([
        this.db.lot.aggregate({ where: parCycle, _min: { dateMiseEnCharge: true }, _max: { dateMiseEnCharge: true } }),
        this.db.mortalite.aggregate({ where: { lot: parCycle }, _min: { dateConstat: true }, _max: { dateConstat: true } }),
        this.db.pesee.aggregate({ where: parCycle, _min: { dateOperation: true }, _max: { dateOperation: true } }),
        this.db.distribution.aggregate({ where: parCycle, _min: { dateDebut: true }, _max: { dateDebut: true } }),
        this.db.distribution.aggregate({ where: parCycle, _max: { dateFin: true } }),
        this.db.traitement.aggregate({ where: parCycle, _min: { dateOperation: true }, _max: { dateOperation: true } }),
        this.db.recolte.aggregate({ where: parCycle, _min: { dateOperation: true }, _max: { dateOperation: true } }),
        this.db.mesureEau.aggregate({ where: parCycle, _min: { dateMesure: true }, _max: { dateMesure: true } }),
        this.db.depense.aggregate({ where: parCycle, _max: { dateOperation: true } }),
      ]);
    const mins = [
      lots._min.dateMiseEnCharge, morts._min.dateConstat, pesees._min.dateOperation,
      distribDebut._min.dateDebut, traitements._min.dateOperation, recoltes._min.dateOperation,
      mesures._min.dateMesure,
    ];
    const maxs = [
      lots._max.dateMiseEnCharge, morts._max.dateConstat, pesees._max.dateOperation,
      distribDebut._max.dateDebut, distribFin._max.dateFin, traitements._max.dateOperation,
      recoltes._max.dateOperation, mesures._max.dateMesure, depenses._max.dateOperation,
    ];
    const jours = (liste: (Date | null)[]) =>
      liste.filter((d): d is Date => d !== null).map((d) => jour(d)!).sort();
    return { premiere: jours(mins)[0] ?? null, derniere: jours(maxs).at(-1) ?? null };
  }

  private async mortalite(l: Ligne, auj: string, id?: string): Promise<Violation[]> {
    const lot = await this.db.lot.findUnique({
      where: { id: String(l['lotId'] ?? '') },
      select: { nombre: true, dateMiseEnCharge: true, cycleId: true },
    });
    if (!lot) return [];
    const b = await this.bornes(lot.cycleId);
    if (!b) return [];
    const [autres, recoltes] = await Promise.all([
      this.db.mortalite.aggregate({
        where: { lotId: String(l['lotId']), ...(id ? { id: { not: id } } : {}) },
        _sum: { nombre: true, remplacement: true },
      }),
      this.db.recolte.aggregate({ where: { lotId: String(l['lotId']) }, _sum: { nombre: true } }),
    ]);
    return controlerMortalite(
      l,
      {
        lot: { nombre: lot.nombre, dateMiseEnCharge: jour(lot.dateMiseEnCharge)! },
        autres: { nombre: autres._sum.nombre ?? 0, remplacement: autres._sum.remplacement ?? 0 },
        recoltes: recoltes._sum.nombre ?? 0,
      },
      b,
      auj,
    );
  }

  private async echantillon(l: Ligne): Promise<Violation[]> {
    const v = controlerEchantillon(l);
    if (l['lotId'] && l['peseeId']) {
      const pesee = await this.db.pesee.findUnique({
        where: { id: String(l['peseeId']) },
        select: { cycleId: true },
      });
      if (pesee) v.push(...(await this.memeCycle('lot', l['lotId'], pesee.cycleId, 'lotId')));
    }
    return v;
  }

  private async recolte(l: Ligne, auj: string, id?: string): Promise<Violation[]> {
    const b = await this.bornes(l['cycleId']);
    if (!b) return [];
    const v: Violation[] = [];
    const cycleId = String(l['cycleId']);
    const lotId = l['lotId'] ? String(l['lotId']) : null;

    let especeLot: string | null = null;
    if (lotId) {
      const lot = await this.db.lot.findUnique({ where: { id: lotId }, select: { cycleId: true, especeId: true } });
      if (lot && lot.cycleId !== cycleId) v.push(incoherent('lotId', 'Ce lot appartient à un autre cycle.'));
      especeLot = lot?.especeId ?? null;
    }

    // Effectif restant : du lot si la récolte le précise, sinon du cycle entier.
    const lots = lotId ? { id: lotId } : { cycleId };
    const [entres, morts, sortis] = await Promise.all([
      this.db.lot.aggregate({ where: lots, _sum: { nombre: true } }),
      this.db.mortalite.aggregate({ where: { lot: lots }, _sum: { nombre: true, remplacement: true } }),
      this.db.recolte.aggregate({
        where: { ...(lotId ? { lotId } : { cycleId }), ...(id ? { id: { not: id } } : {}) },
        _sum: { nombre: true },
      }),
    ]);
    const effectifRestant =
      (entres._sum.nombre ?? 0) + (morts._sum.remplacement ?? 0) - (morts._sum.nombre ?? 0) - (sortis._sum.nombre ?? 0);

    v.push(...controlerRecolte(l, { especeLot, effectifRestant }, b, auj));
    return v;
  }

  private async mesureEau(l: Ligne, auj: string): Promise<Violation[]> {
    const b = await this.bornes(l['cycleId']);
    const v = controlerMesureEau(l, b, auj);
    if (b && l['infrastructureId'] && b.infrastructureId !== l['infrastructureId']) {
      v.push(incoherent('cycleId', "Ce cycle se déroule dans une autre infrastructure."));
    }
    if (l['peseeId'] && l['cycleId']) {
      v.push(...(await this.memeCycle('pesee', l['peseeId'], l['cycleId'], 'peseeId')));
    }
    return v;
  }
}
