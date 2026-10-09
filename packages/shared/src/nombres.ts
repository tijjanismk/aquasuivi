/**
 * Nombres tapés à la française.
 *
 * Un utilisateur francophone écrit « 12,5 » et « 500 000 » ; `Number()` y lit
 * NaN dans les deux cas. Une seule lecture pour l'API et le téléphone, pour
 * qu'une saisie acceptée d'un côté ne soit pas refusée de l'autre.
 */

/** « 12,5 », « 500 000 », « 1 750,50 » → nombre ; `null` si vide ou illisible. */
export function lireNombre(texte: unknown): number | null {
  if (typeof texte === 'number') return Number.isFinite(texte) ? texte : null;
  if (typeof texte !== 'string') return null;
  // Espaces des milliers, y compris insécables (U+00A0, U+202F) que produit Intl.
  const net = texte.replace(/[\s  ]/g, '').replace(',', '.');
  if (net === '') return null;
  const n = Number(net);
  return Number.isFinite(n) ? n : null;
}
