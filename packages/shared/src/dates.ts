/**
 * Dates de terrain : chaînes « AAAA-MM-JJ », sans heure ni fuseau.
 *
 * Une pêche de contrôle a lieu un jour, pas à un instant. Manipuler ces dates
 * comme des objets Date introduit des décalages de fuseau qui font glisser une
 * saisie au jour précédent — un bug silencieux et pénible à diagnostiquer.
 */

import type { DateISO } from './types.js';

const JOUR_MS = 86_400_000;

/** Nombre de jours entre deux dates de terrain. Négatif si b précède a. */
export function joursEntre(a: DateISO, b: DateISO): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / JOUR_MS);
}

export function ajouterJours(date: DateISO, jours: number): DateISO {
  const t = Date.parse(`${date}T00:00:00Z`) + jours * JOUR_MS;
  return new Date(t).toISOString().slice(0, 10);
}

export function aujourdhui(): DateISO {
  return new Date().toISOString().slice(0, 10);
}

export function estAvant(a: DateISO, b: DateISO): boolean {
  return a < b; // l'ordre lexicographique du format ISO est l'ordre chronologique
}

/** Trie une liste d'objets par leur date, du plus ancien au plus récent. */
export function parDate<T>(liste: T[], cle: (item: T) => DateISO): T[] {
  return [...liste].sort((x, y) => (cle(x) < cle(y) ? -1 : cle(x) > cle(y) ? 1 : 0));
}
