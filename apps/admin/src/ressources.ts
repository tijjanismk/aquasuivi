/// Index unique des ressources. Les écrans génériques s'y adressent, qu'il
/// s'agisse d'un référentiel administré ou d'une table de terrain.

import type { Ressource } from './description';
import { REFERENTIELS } from './referentiels';
import { RESSOURCES_SAISIE } from './saisie';
import { ADMINISTRATION } from './administration';

export const TOUTES: Ressource[] = [...REFERENTIELS, ...RESSOURCES_SAISIE, ...ADMINISTRATION];

export function parNom(nom: string): Ressource | undefined {
  return TOUTES.find((r) => r.nom === nom);
}

export function parChemin(chemin: string): Ressource | undefined {
  return TOUTES.find((r) => r.chemin === chemin);
}

/// Libellé lisible d'une ligne liée : les relations pointent vers des
/// ressources dont la colonne d'affichage n'est pas toujours `nom`.
export function libelleLigne(ligne: Record<string, unknown> | undefined, champ = 'nom'): string {
  if (!ligne) return '';
  const valeur = ligne[champ];
  if (typeof valeur === 'string' && valeur) return valeur;
  const identifiant = String(ligne['id'] ?? '');
  return identifiant ? identifiant.slice(-6) : '';
}
