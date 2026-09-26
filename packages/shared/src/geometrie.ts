/**
 * Surface et volume en eau à partir des dimensions saisies.
 *
 * Une seule implémentation, appelée par l'API à l'écriture et par le mobile
 * pour l'aperçu immédiat. Sur la version précédente, ces formules vivaient en
 * colonnes générées MySQL, donc inaccessibles hors ligne.
 */

import type { InfrastructureDim } from './types.js';

const arrondi = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** Surface au miroir, en m². */
export function superficie(d: InfrastructureDim): number | null {
  if (d.forme === 'CIRCULAIRE') {
    if (!d.diametre) return null;
    return arrondi(Math.PI * (d.diametre / 2) ** 2);
  }
  if (!d.longueur || !d.largeur) return null;
  return arrondi(d.longueur * d.largeur);
}

/**
 * Volume réellement en eau, en m³.
 * Le niveau de remplissage compte : un bassin d'un mètre rempli à 80 %
 * ne contient pas le volume de sa profondeur totale.
 */
export function volume(d: InfrastructureDim): number | null {
  const s = superficie(d);
  if (s === null || !d.profondeur) return null;
  const niveau = (d.niveauRemplissage ?? 100) / 100;
  return arrondi(s * d.profondeur * niveau);
}

/** Les deux d'un coup, tels qu'ils sont stockés sur l'infrastructure. */
export function dimensionsCalculees(d: InfrastructureDim) {
  return { superficie: superficie(d), volume: volume(d) };
}
