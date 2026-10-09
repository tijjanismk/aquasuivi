/**
 * Table de rationnement.
 *
 * Les taux étaient auparavant écrits en dur dans les formules du tableur —
 * 0,06 puis 0,03, 0,02, 0,015, 0,01, et deux multiplications par zéro qui
 * annulaient silencieusement la ration des dernières pêches. Ils sont
 * désormais une donnée, interrogée ici.
 */

import type { CycleComplet, Echantillon, PalierRationnement, Pesee } from './types.js';
import type { Indicateurs } from './indicateurs.js';

/**
 * Palier applicable à un poids moyen et, si elle est connue, à une
 * température d'eau.
 *
 * Un palier contraint par la température l'emporte sur un palier générique :
 * la température est l'information la plus déterminante pour l'appétit, et
 * l'ignorer conduit à suralimenter en eau froide — de l'aliment payé qui
 * pollue le bassin au lieu de devenir du poisson.
 */
export function palierApplicable(
  paliers: PalierRationnement[],
  especeId: string,
  poidsMoyenG: number,
  temperature?: number | null,
): PalierRationnement | null {
  const candidats = paliers.filter(
    (p) => p.especeId === especeId && poidsMoyenG >= p.poidsMin && poidsMoyenG < p.poidsMax,
  );
  if (candidats.length === 0) return null;

  if (temperature != null) {
    const thermiques = candidats.filter(
      (p) =>
        (p.temperatureMin == null || temperature >= p.temperatureMin) &&
        (p.temperatureMax == null || temperature < p.temperatureMax) &&
        (p.temperatureMin != null || p.temperatureMax != null),
    );
    if (thermiques.length > 0) return thermiques[0]!;
  }

  const generique = candidats.find((p) => p.temperatureMin == null && p.temperatureMax == null);
  return generique ?? candidats[0]!;
}

/** Ration journalière en kg, pour une biomasse en kg et un taux en %. */
export function ration(biomasseKg: number, tauxPct: number): number {
  return Math.round(biomasseKg * tauxPct) / 100;
}

/** Ration conseillée, si un palier correspond. */
export function rationConseillee(
  paliers: PalierRationnement[],
  especeId: string,
  poidsMoyenG: number,
  biomasseKg: number,
  temperature?: number | null,
): { tauxPct: number; rationKg: number; frequenceRepas: number; source?: string | null } | null {
  const p = palierApplicable(paliers, especeId, poidsMoyenG, temperature);
  if (!p) return null;
  return {
    tauxPct: p.tauxPct,
    rationKg: ration(biomasseKg, p.tauxPct),
    frequenceRepas: p.frequenceRepas,
    source: p.source,
  };
}

export type ConseilRation = ReturnType<typeof rationConseillee>;

/** Ce qu'une pêche de contrôle permet de fixer : la biomasse, et le palier qui en découle. */
export interface RationDuCycle {
  /** Espèce du lot le plus lourd en biomasse : c'est son palier qui fait foi. */
  especeId: string;
  poidsMoyenG: number;
  effectif: number;
  biomasseKg: number;
  conseil: ConseilRation;
}

/**
 * Biomasse du bassin et ration conseillée, à partir des indicateurs du cycle.
 * Palier de l'espèce du lot le plus lourd, à son poids moyen, appliqué à la
 * biomasse totale. En polyculture c'est une approximation : un seul aliment
 * nourrit tout le bassin.
 */
export function rationDuCycle(
  i: Indicateurs,
  paliers: PalierRationnement[],
  temperature?: number | null,
): RationDuCycle | null {
  const principal = [...i.lots].sort((a, b) => b.biomasseKg - a.biomasseKg)[0];
  const effectif = i.lots.reduce((s, l) => s + l.effectif, 0);
  if (!principal || effectif <= 0) return null;
  const biomasseKg = Math.round(i.lots.reduce((s, l) => s + l.biomasseKg, 0) * 1000) / 1000;
  return {
    especeId: principal.lot.especeId,
    poidsMoyenG: principal.poidsMoyenG,
    effectif,
    biomasseKg,
    conseil: rationConseillee(paliers, principal.lot.especeId, principal.poidsMoyenG, biomasseKg, temperature),
  };
}

/**
 * Le cycle tel que la pêche de contrôle le révèle, le jour même : cette pesée
 * avec ses échantillons (en cours de saisie, ou corrigés), sans les pesées ni
 * les mortalités postérieures. C'est sur ce poids moyen-là que se fixe la
 * ration jusqu'à la pêche suivante (D29), pas sur celui de la pêche d'avant.
 */
export function cycleAuJourDeLaPesee(
  d: CycleComplet,
  pesee: Pesee,
  echantillons: Omit<Echantillon, 'peseeId'>[],
): CycleComplet {
  const jour = pesee.dateOperation;
  // La pesée saisie en dernier : à date égale, c'est elle qui fixe le poids.
  const pesees = [...d.pesees.filter((p) => p.id !== pesee.id && p.dateOperation <= jour), pesee];
  const gardees = new Set(pesees.map((p) => p.id));
  return {
    ...d,
    mortalites: d.mortalites.filter((m) => m.dateConstat <= jour),
    pesees,
    echantillons: [
      ...d.echantillons.filter((e) => e.peseeId !== pesee.id && gardees.has(e.peseeId)),
      ...echantillons.map((e) => ({ ...e, peseeId: pesee.id })),
    ],
  };
}
