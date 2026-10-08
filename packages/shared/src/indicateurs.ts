/**
 * Indicateurs zootechniques et économiques d'un cycle.
 *
 * Implémentation unique, partagée par l'API, l'admin et le mobile. C'est le
 * gain principal du choix TypeScript : sur un mobile natif, ces formules
 * auraient dû être réécrites dans un second langage, avec le risque de
 * divergence que cela suppose.
 *
 * Formules retenues : celles de la littérature aquacole (FCR, taux de survie,
 * TCS, GMQ, rendement), pour que les résultats d'une exploitation soient
 * comparables à ceux publiés ailleurs et agrégeables au niveau national.
 *
 * Corrections par rapport au calcul de la version précédente :
 *  1. Coût des alevins de remplacement : on somme les produits ligne à ligne.
 *     L'ancien calcul multipliait la somme des remplacements par la somme des
 *     prix unitaires — avec trois pesées à 110 F, le remplacement était
 *     facturé 330 F l'alevin, et l'erreur croissait avec la durée du cycle.
 *  2. Production : la récolte pesée fait foi. L'ancien rapport renvoyait la
 *     biomasse estimée à la dernière pêche et ignorait les ventes.
 *  3. Divisions toutes protégées.
 */

import { joursEntre, parDate } from './dates.js';
import { quantiteDistribuee } from './alimentation.js';
import type { CycleComplet, DateISO, Lot } from './types.js';

const arrondi = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
/** Le F CFA n'a pas de subdivision en usage : les montants restent entiers. */
const francs = (v: number) => Math.round(v);

export interface EtatLot {
  lot: Lot;
  especeNom: string;
  effectifInitial: number;
  mortalite: number;
  remplacement: number;
  effectif: number;
  poidsMoyenInitialG: number;
  poidsMoyenG: number;
  biomasseKg: number;
}

export interface ContexteIndicateurs {
  /** Jour du calcul : une ration encore ouverte compte jusqu'à lui (D29). */
  aujourdhui?: DateISO | null;
}

export function calculerIndicateurs(d: CycleComplet, ctx: ContexteIndicateurs = {}) {
  const {
    cycle, infrastructure, lots, mortalites, pesees,
    echantillons, distributions, traitements, recoltes, depenses, especes,
  } = d;

  const especeDe = (id: string) => especes.find((e) => e.id === id);
  const peseesTriees = parDate(pesees, (p) => p.dateOperation);
  const dernierePesee = peseesTriees[peseesTriees.length - 1];

  // ---------------------------------------------------------------- effectifs
  const etatsLots: EtatLot[] = lots.map((lot) => {
    const m = mortalites.filter((x) => x.lotId === lot.id);
    const mortalite = m.reduce((s, x) => s + x.nombre, 0);
    const remplacement = m.reduce((s, x) => s + x.remplacement, 0);
    const effectif = Math.max(0, lot.nombre - mortalite + remplacement);

    // Poids moyen du lot à la dernière pesée où il a été échantillonné.
    let poidsMoyenG = lot.poidsMoyenG;
    for (const p of peseesTriees) {
      const ech = echantillons.filter(
        (e) => e.peseeId === p.id && (e.lotId === lot.id || (e.lotId == null && lots.length === 1)),
      );
      const n = ech.reduce((s, e) => s + e.nombre, 0);
      const poids = ech.reduce((s, e) => s + e.poidsTotalG, 0);
      if (n > 0) poidsMoyenG = poids / n;
    }

    return {
      lot,
      especeNom: especeDe(lot.especeId)?.nom ?? '—',
      effectifInitial: lot.nombre,
      mortalite,
      remplacement,
      effectif,
      poidsMoyenInitialG: lot.poidsMoyenG,
      poidsMoyenG: arrondi(poidsMoyenG),
      biomasseKg: arrondi((effectif * poidsMoyenG) / 1000, 3),
    };
  });

  const effectifInitial = lots.reduce((s, l) => s + l.nombre, 0);
  const mortaliteTotale = mortalites.reduce((s, m) => s + m.nombre, 0);
  const remplacementTotal = mortalites.reduce((s, m) => s + m.remplacement, 0);
  const effectifFinal = etatsLots.reduce((s, e) => s + e.effectif, 0);

  const baseSurvie = effectifInitial + remplacementTotal;
  const tauxSurvie = baseSurvie > 0 ? arrondi((effectifFinal / baseSurvie) * 100) : null;

  // ------------------------------------------------------------- croissance
  const poidsMoyenInitialG =
    effectifInitial > 0
      ? arrondi(lots.reduce((s, l) => s + l.poidsMoyenG * l.nombre, 0) / effectifInitial)
      : 0;

  // La récolte prime : des poissons pesés et comptés à la vente sont une
  // mesure, pas une estimation.
  const recoltesComptees = recoltes.filter((r) => r.nombre != null && r.nombre > 0);
  const poidsMoyenFinalG =
    recoltesComptees.length > 0
      ? arrondi(
          (recoltesComptees.reduce((s, r) => s + r.poidsKg, 0) * 1000) /
            recoltesComptees.reduce((s, r) => s + (r.nombre ?? 0), 0),
        )
      : effectifFinal > 0
        ? arrondi(etatsLots.reduce((s, e) => s + e.poidsMoyenG * e.effectif, 0) / effectifFinal)
        : poidsMoyenInitialG;

  const dateFin: DateISO =
    cycle.dateCloture ??
    recoltes.reduce<DateISO | null>((max, r) => (!max || r.dateOperation > max ? r.dateOperation : max), null) ??
    dernierePesee?.dateOperation ??
    cycle.dateMiseEnCharge;

  const dureeJours = Math.max(0, joursEntre(cycle.dateMiseEnCharge, dateFin));

  const gainMoyenQuotidien =
    dureeJours > 0 ? arrondi((poidsMoyenFinalG - poidsMoyenInitialG) / dureeJours, 3) : null;

  /**
   * Taux de croissance spécifique, en % de poids par jour.
   * Seul indicateur qui rende comparables des poissons de tailles
   * différentes — un alevin de 20 g et un adulte de 300 g.
   */
  const tauxCroissanceSpecifique =
    poidsMoyenInitialG > 0 && poidsMoyenFinalG > 0 && dureeJours > 0
      ? arrondi(((Math.log(poidsMoyenFinalG) - Math.log(poidsMoyenInitialG)) / dureeJours) * 100, 4)
      : null;

  /**
   * Coefficient de variation des poids, calculé sur les échantillons de la
   * dernière pesée — donc sans aucune saisie supplémentaire. Au-delà de 25 %
   * environ, le lot est hétérogène : il faut envisager un tri, et chez le
   * clarias c'est un signal précoce de cannibalisme.
   */
  let coefficientVariation: number | null = null;
  if (dernierePesee) {
    const poids = echantillons
      .filter((e) => e.peseeId === dernierePesee.id && e.nombre > 0)
      .map((e) => e.poidsTotalG / e.nombre);
    if (poids.length >= 2) {
      const moyenne = poids.reduce((s, p) => s + p, 0) / poids.length;
      if (moyenne > 0) {
        const variance = poids.reduce((s, p) => s + (p - moyenne) ** 2, 0) / (poids.length - 1);
        coefficientVariation = arrondi((Math.sqrt(variance) / moyenne) * 100);
      }
    }
  }

  // ----------------------------------------------------- production, rendement
  const biomasseInitialeKg = arrondi((effectifInitial * poidsMoyenInitialG) / 1000, 3);
  const biomasseFinaleKg = arrondi(etatsLots.reduce((s, e) => s + e.biomasseKg, 0), 3);
  const productionRecolteeKg = arrondi(recoltes.reduce((s, r) => s + r.poidsKg, 0), 3);
  const productionKg = productionRecolteeKg > 0 ? productionRecolteeKg : biomasseFinaleKg;
  const productionNetteKg = arrondi(productionKg - biomasseInitialeKg, 3);

  const mesure =
    infrastructure.mesureBase === 'VOLUME' ? (infrastructure.volume ?? 0) : (infrastructure.superficie ?? 0);
  const uniteMesure = infrastructure.mesureBase === 'VOLUME' ? 'm³' : 'm²';

  const densiteInitiale = mesure > 0 ? arrondi(effectifInitial / mesure) : null;
  const chargeFinale = mesure > 0 ? arrondi(biomasseFinaleKg / mesure) : null;
  const rendementCycle = mesure > 0 ? arrondi(productionKg / mesure, 3) : null;

  /**
   * Rendement annualisé. En tonnes par hectare et par an pour les
   * infrastructures mesurées en surface : c'est l'unité des statistiques de
   * production, donc celle qui permet de se situer dans une moyenne régionale.
   */
  const rendementAnnuel =
    mesure > 0 && dureeJours > 0
      ? infrastructure.mesureBase === 'SUPERFICIE'
        ? { valeur: arrondi((productionKg / mesure) * (365 / dureeJours) * 10, 3), unite: 't/ha/an' }
        : { valeur: arrondi((productionKg / mesure) * (365 / dureeJours), 3), unite: 'kg/m³/an' }
      : null;

  // -------------------------------------------------------------- alimentation
  // Ration × jours jusqu'à la pêche suivante, sauf quantité mesurée (D29).
  const contexteAliment = { pesees, dateCloture: cycle.dateCloture, aujourdhui: ctx.aujourdhui };
  const quantites = distributions.map((x) => ({ x, q: quantiteDistribuee(x, contexteAliment) }));
  const alimentDistribueKg = arrondi(quantites.reduce((s, { q }) => s + q.kg, 0), 3);
  const enCours = quantites.filter(({ q }) => q.enCours);
  const rationEnCoursKgJour =
    enCours.length > 0 ? arrondi(enCours.reduce((s, { x }) => s + (x.rationKgJour ?? 0), 0), 3) : null;

  /**
   * Indice de consommation, rapporté à la production NETTE comme le veut la
   * définition. Le rapporter au poids récolté brut flatte le résultat en
   * créditant l'élevage du poids des alevins mis en charge.
   */
  const indiceConsommation =
    productionNetteKg > 0 ? arrondi(alimentDistribueKg / productionNetteKg, 3) : null;

  // ------------------------------------------------------------------ économie
  const coutAlevinsInitial = lots.reduce((s, l) => s + l.nombre * l.coutUnitaire, 0);
  // Correction : somme des produits, et non produit des sommes.
  const coutRemplacements = mortalites.reduce((s, m) => {
    const prix = m.coutUnitaire ?? lots.find((l) => l.id === m.lotId)?.coutUnitaire ?? 0;
    return s + m.remplacement * prix;
  }, 0);
  const coutAlevins = francs(coutAlevinsInitial + coutRemplacements);

  const coutAliments = francs(
    quantites.reduce((s, { x, q }) => s + q.kg * (x.prixKgApplique ?? 0), 0),
  );
  const coutTraitements = francs(
    traitements.reduce((s, t) => s + (t.quantite ?? 1) * (t.prixUnitaire ?? 0), 0),
  );
  const autresCharges = francs(depenses.reduce((s, x) => s + x.montant, 0));
  const totalCharges = coutAlevins + coutAliments + coutTraitements + autresCharges;

  const bloc = (type: string) => {
    const l = recoltes.filter((r) => r.type === type);
    return {
      quantiteKg: arrondi(l.reduce((s, r) => s + r.poidsKg, 0), 3),
      montant: francs(l.reduce((s, r) => s + r.poidsKg * r.prixKg, 0)),
      operations: l.length,
    };
  };
  // Dons et autoconsommation sont valorisés : sans cela, un pisciculteur qui
  // nourrit sa famille apparaîtrait en perte alors qu'il produit de la valeur.
  const vente = bloc('VENTE');
  const don = bloc('DON');
  const autoconsommation = bloc('AUTOCONSOMMATION');
  const totalProduits = vente.montant + don.montant + autoconsommation.montant;

  const prixRevientKg = productionKg > 0 ? francs(totalCharges / productionKg) : null;
  const prixVenteMoyenKg = vente.quantiteKg > 0 ? francs(vente.montant / vente.quantiteKg) : null;
  const margeKg =
    prixVenteMoyenKg !== null && prixRevientKg !== null ? prixVenteMoyenKg - prixRevientKg : null;
  const resultat = totalProduits - totalCharges;
  const rentabilite = totalCharges > 0 ? arrondi((resultat / totalCharges) * 100) : null;

  // ------------------------------------------------------------- conformité
  const finsDelai = traitements.map((t) => t.finDelaiAttente).filter((x): x is DateISO => !!x);
  const finDelaiAttente = finsDelai.length > 0 ? finsDelai.reduce((a, b) => (a > b ? a : b)) : null;
  const recoltesNonConformes = finDelaiAttente
    ? recoltes.filter((r) => r.dateOperation < finDelaiAttente)
    : [];

  // ------------------------------------------------------------------ alertes
  const especePrincipale = especeDe(cycle.especeId ?? lots[0]?.especeId ?? '');
  const gainRef = especePrincipale?.gainJournalierRef ?? null;
  const performance =
    gainRef && gainRef > 0 && gainMoyenQuotidien !== null
      ? arrondi(gainMoyenQuotidien / gainRef, 3)
      : null;

  return {
    cycle: {
      id: cycle.id,
      numero: cycle.numero,
      statut: cycle.statut,
      infrastructure: infrastructure.nom,
      dateMiseEnCharge: cycle.dateMiseEnCharge,
      dateCloture: cycle.dateCloture ?? null,
      dureeJours,
    },
    lots: etatsLots,
    zootechnie: {
      effectifInitial,
      effectifFinal,
      mortalite: mortaliteTotale,
      remplacement: remplacementTotal,
      tauxSurviePct: tauxSurvie,
      poidsMoyenInitialG,
      poidsMoyenFinalG,
      gainMoyenQuotidienGJ: gainMoyenQuotidien,
      tauxCroissanceSpecifiquePctJ: tauxCroissanceSpecifique,
      coefficientVariationPct: coefficientVariation,
      nombrePesees: pesees.length,
      /** < 1 : croissance sous la référence de l'espèce. */
      performance,
    },
    production: {
      biomasseInitialeKg,
      biomasseFinaleKg,
      productionRecolteeKg,
      productionNetteKg,
      densiteInitiale,
      chargeFinale,
      uniteMesure,
      rendementCycle,
      rendementAnnuel,
    },
    alimentation: {
      alimentDistribueKg,
      /** Ration qui court depuis la dernière pêche, tous aliments ; `null` sans ration ouverte. */
      rationEnCoursKgJour,
      indiceConsommation,
      coutAlimentParKg: productionNetteKg > 0 ? francs(coutAliments / productionNetteKg) : null,
    },
    economie: {
      charges: {
        alevins: coutAlevins,
        aliments: coutAliments,
        traitements: coutTraitements,
        autres: autresCharges,
        total: totalCharges,
      },
      produits: { vente, don, autoconsommation, total: totalProduits },
      prixRevientKg,
      prixVenteMoyenKg,
      margeKg,
      resultat,
      rentabilitePct: rentabilite,
    },
    conformite: {
      finDelaiAttente,
      recoltesNonConformes: recoltesNonConformes.length,
    },
  };
}

export type Indicateurs = ReturnType<typeof calculerIndicateurs>;
