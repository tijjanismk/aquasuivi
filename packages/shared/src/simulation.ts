/**
 * Simulation d'un projet piscicole (étape 9).
 *
 * À partir d'un capital, d'une espèce, d'un type de bassin et d'une surface,
 * on projette un **cycle fictif** — alevins, mortalités, aliment, récolte —
 * à partir des repères de l'espèce, puis on le passe à `calculerIndicateurs`.
 * C'est la raison d'être de D13 : une projection et un cycle réel sont
 * chiffrés par le même code, donc comparables ligne à ligne.
 */

import type { CycleComplet, DateISO, Espece, FormeInfrastructure, MesureBase } from './types.js';
import { calculerIndicateurs, type Indicateurs } from './indicateurs.js';
import { ajouterJours } from './dates.js';

export interface EspeceSimulation extends Espece {
  poidsMarcheMin?: number | null;
  poidsMarcheMax?: number | null;
  dureeCycleRef?: number | null;
}

export interface TypeSimulation {
  id: string;
  nom: string;
  forme: FormeInfrastructure;
  mesureBase: MesureBase;
  densiteMaxDefaut?: number | null;
}

export interface ParametresSimulation {
  /** Argent disponible pour lancer le cycle, en francs CFA. */
  capital: number;
  especeId: string;
  typeInfrastructureId: string;
  /** m² (étang) ou m³ (bac, cage), selon le type de bassin. */
  taille: number;
  /** Poissons par m² ou m³. Défaut : 80 % de la densité maximale de l'espèce. */
  densite?: number | null;
  poidsInitialG?: number | null;
  /** Poids de vente visé. Défaut : milieu de la fourchette marchande. */
  poidsCibleG?: number | null;
  prixAlevin: number;
  prixAlimentKg: number;
  prixVenteKg: number;
  /** Main-d'œuvre, eau, transport… pour tout le cycle. */
  autresCharges?: number | null;
  dateDebut?: DateISO | null;
}

export interface Simulation {
  hypotheses: string[];
  projection: {
    densite: number;
    effectifInitial: number;
    effectifFinal: number;
    poidsInitialG: number;
    poidsCibleG: number;
    dureeJours: number;
    dateRecolte: DateISO;
    alimentKg: number;
    productionKg: number;
    cyclesParAn: number;
  };
  indicateurs: Indicateurs;
  rentabilite: {
    prixRevientKg: number | null;
    /** Prix de vente en dessous duquel le cycle perd de l'argent. */
    seuilPrixVenteKg: number | null;
    /** Kilos à vendre au prix visé pour couvrir les charges. */
    seuilProductionKg: number | null;
    resultat: number;
    rentabilitePct: number | null;
    resultatAnnuel: number;
  };
  financement: {
    /** Tout ce qu'il faut payer avant la première vente. */
    besoin: number;
    capital: number;
    ecart: number;
    suffisant: boolean;
    /** Taille exploitable avec ce capital, à la même densité. */
    tailleFinancable: number;
  };
  /** Le cycle fictif lui-même : on peut le rejouer, l'afficher, le comparer. */
  cycleProjete: CycleComplet;
}

export class ErreurSimulation extends Error {}

const arrondi = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
const fr = (v: number, d = 0) => arrondi(v, d).toLocaleString('fr-FR');

export function simuler(
  p: ParametresSimulation,
  especes: EspeceSimulation[],
  types: TypeSimulation[],
): Simulation {
  const espece = especes.find((e) => e.id === p.especeId);
  const type = types.find((t) => t.id === p.typeInfrastructureId);
  if (!espece) throw new ErreurSimulation('Espèce inconnue.');
  if (!type) throw new ErreurSimulation('Type de bassin inconnu.');
  if (!(p.taille > 0)) throw new ErreurSimulation('La taille du bassin doit être positive.');
  if (!(p.prixVenteKg > 0)) throw new ErreurSimulation('Le prix de vente doit être positif.');

  const hypotheses: string[] = [];
  const parM3 = type.mesureBase === 'VOLUME';
  const unite = parM3 ? 'm³' : 'm²';

  // --- Densité, poids, durée : les repères de l'espèce ---
  const densiteMax = (parM3 ? espece.densiteMaxM3 : espece.densiteMaxM2) ?? type.densiteMaxDefaut ?? null;
  let densite = p.densite ?? null;
  if (!densite) {
    if (!densiteMax) throw new ErreurSimulation(`Densité à préciser : l’espèce n’a pas de densité maximale au ${unite}.`);
    densite = arrondi(densiteMax * 0.8, 1);
    hypotheses.push(`Densité : ${fr(densite, 1)} poissons/${unite}, soit 80 % du maximum de l’espèce.`);
  } else if (densiteMax && densite > densiteMax) {
    hypotheses.push(`Attention : ${fr(densite, 1)} poissons/${unite} dépasse le maximum de l’espèce (${fr(densiteMax, 1)}).`);
  }

  const poidsInitialG = p.poidsInitialG ?? 5;
  if (!p.poidsInitialG) hypotheses.push('Alevins de 5 g à la mise en charge.');
  let poidsCibleG = p.poidsCibleG ?? null;
  if (!poidsCibleG) {
    const min = espece.poidsMarcheMin ?? null;
    const max = espece.poidsMarcheMax ?? null;
    if (!min && !max) throw new ErreurSimulation('Poids de vente à préciser : l’espèce n’a pas de poids marchand.');
    poidsCibleG = Math.round(((min ?? max!) + (max ?? min!)) / 2);
    hypotheses.push(`Vente à ${fr(poidsCibleG)} g, milieu de la fourchette marchande.`);
  }
  if (poidsCibleG <= poidsInitialG) throw new ErreurSimulation('Le poids de vente doit dépasser le poids des alevins.');

  const gain = espece.gainJournalierRef ?? null;
  const dureeJours = gain && gain > 0
    ? Math.ceil((poidsCibleG - poidsInitialG) / gain)
    : (espece.dureeCycleRef ?? null);
  if (!dureeJours) throw new ErreurSimulation('Durée à estimer : l’espèce n’a ni gain journalier ni durée de cycle de référence.');
  hypotheses.push(gain ? `Croissance de ${fr(gain, 1)} g/jour (référence de l’espèce) : ${dureeJours} jours.` : `Durée de cycle de référence : ${dureeJours} jours.`);

  // Survie en fraction (0,9) ou en pourcentage (90) selon la saisie.
  const survieRef = espece.tauxSurvieRef ?? 0.85;
  const survie = survieRef > 1 ? survieRef / 100 : survieRef;
  if (espece.tauxSurvieRef == null) hypotheses.push('Survie de 85 % (l’espèce n’a pas de référence).');
  const ic = espece.indiceConsommationRef ?? 1.8;
  if (espece.indiceConsommationRef == null) hypotheses.push('Indice de consommation de 1,8 (l’espèce n’a pas de référence).');

  // --- Le cycle fictif ---
  const effectifInitial = Math.round(densite * p.taille);
  if (effectifInitial < 1) throw new ErreurSimulation('Moins d’un poisson : augmentez la taille ou la densité.');
  const morts = Math.round(effectifInitial * (1 - survie));
  const effectifFinal = effectifInitial - morts;
  const productionKg = arrondi((effectifFinal * poidsCibleG) / 1000, 3);
  const alimentKg = arrondi(ic * (productionKg - (effectifInitial * poidsInitialG) / 1000), 3);
  const debut = p.dateDebut ?? '2000-01-01';
  const dateRecolte = ajouterJours(debut, dureeJours);
  const autres = p.autresCharges ?? 0;

  const cycleProjete: CycleComplet = {
    cycle: { id: 'simulation', numero: 1, dateMiseEnCharge: debut, dateCloture: dateRecolte, statut: 'BOUCLE', especeId: espece.id },
    infrastructure: {
      id: 'simulation', nom: type.nom, mesureBase: type.mesureBase, forme: type.forme,
      superficie: parM3 ? null : p.taille, volume: parM3 ? p.taille : null,
    },
    especes: [espece],
    lots: [{ id: 'lot', especeId: espece.id, nombre: effectifInitial, poidsMoyenG: poidsInitialG, coutUnitaire: p.prixAlevin, dateMiseEnCharge: debut }],
    mortalites: morts > 0 ? [{ id: 'morts', lotId: 'lot', dateConstat: ajouterJours(debut, Math.round(dureeJours / 3)), nombre: morts, remplacement: 0 }] : [],
    pesees: [],
    echantillons: [],
    distributions: alimentKg > 0 ? [{ id: 'aliment', alimentId: 'simulation', dateDebut: debut, quantiteTotaleKg: alimentKg, prixKgApplique: p.prixAlimentKg }] : [],
    traitements: [],
    // Récolte comptée : le poids moyen final est alors mesuré, pas estimé (D14).
    recoltes: [{ id: 'recolte', lotId: 'lot', especeId: espece.id, dateOperation: dateRecolte, type: 'VENTE', poidsKg: productionKg, nombre: effectifFinal, prixKg: p.prixVenteKg }],
    depenses: autres > 0 ? [{ id: 'autres', categorie: 'AUTRE', montant: autres, dateOperation: dateRecolte }] : [],
  };

  const indicateurs = calculerIndicateurs(cycleProjete);
  const e = indicateurs.economie;
  const besoin = e.charges.total;
  const parUnite = besoin / p.taille;
  const cyclesParAn = arrondi(365 / dureeJours, 2);

  return {
    hypotheses,
    projection: {
      densite, effectifInitial, effectifFinal, poidsInitialG, poidsCibleG, dureeJours,
      dateRecolte, alimentKg, productionKg, cyclesParAn,
    },
    indicateurs,
    rentabilite: {
      prixRevientKg: e.prixRevientKg,
      seuilPrixVenteKg: e.prixRevientKg,
      seuilProductionKg: p.prixVenteKg > 0 ? arrondi(besoin / p.prixVenteKg, 1) : null,
      resultat: e.resultat,
      rentabilitePct: e.rentabilitePct,
      resultatAnnuel: Math.round(e.resultat * cyclesParAn),
    },
    financement: {
      besoin,
      capital: p.capital,
      ecart: p.capital - besoin,
      suffisant: p.capital >= besoin,
      tailleFinancable: parUnite > 0 ? arrondi(p.capital / parUnite, 1) : 0,
    },
    cycleProjete,
  };
}
