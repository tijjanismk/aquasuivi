import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/// Fusionne des classes Tailwind en laissant la dernière gagner : sans
/// `twMerge`, `class="p-2"` et `class="p-4"` coexistent et le résultat dépend
/// de l'ordre dans la feuille de style.
export function cn(...entrees: ClassValue[]) {
  return twMerge(clsx(entrees));
}
