/**
 * Table de rationnement.
 *
 * Les taux étaient auparavant écrits en dur dans les formules du tableur —
 * 0,06 puis 0,03, 0,02, 0,015, 0,01, et deux multiplications par zéro qui
 * annulaient silencieusement la ration des dernières pêches. Ils sont
 * désormais une donnée, interrogée ici.
 */

import type { PalierRationnement } from './types.js';

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
