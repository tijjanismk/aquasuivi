import { Prisma } from '@prisma/client';

/// Champs `@db.Date` du schéma : une date de terrain, sans heure ni fuseau.
/// Les renvoyer en horodatage ISO ferait afficher la veille à tout client situé
/// à l'ouest de UTC — c'est exactement ce qui cassait à la synchronisation (D4).
const DATES_SANS_HEURE = new Set([
  'dateCloture',
  'dateConstat',
  'dateConstruction',
  'dateCreation',
  'dateDebut',
  'dateDerniereRehabilitation',
  'dateFin',
  'dateMesure',
  'dateMiseEnCharge',
  'dateOperation',
  'debutLe',
  'finDelaiAttente',
  'finLe',
]);

export function estDateSansHeure(champ: string): boolean {
  return DATES_SANS_HEURE.has(champ);
}

const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/;

/// « AAAA-MM-JJ » → minuit UTC, seule façon de faire coïncider la date stockée
/// avec la date saisie quelle que soit la machine.
export function versDateStockee(valeur: unknown): Date | null {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  if (valeur instanceof Date) return valeur;
  const texte = String(valeur);
  const jour = FORMAT_DATE.test(texte) ? texte : texte.slice(0, 10);
  if (!FORMAT_DATE.test(jour)) {
    throw new Error(`Date attendue au format AAAA-MM-JJ, reçu « ${texte} »`);
  }
  return new Date(`${jour}T00:00:00.000Z`);
}

function versDateTerrain(valeur: Date): string {
  return valeur.toISOString().slice(0, 10);
}

/// Sortie : `Decimal` en nombre (sans quoi les additions concatènent des
/// chaînes côté client) et dates de terrain en « AAAA-MM-JJ ».
export function versSortie(valeur: unknown, champ?: string): unknown {
  if (valeur instanceof Prisma.Decimal) return valeur.toNumber();
  if (valeur instanceof Date) {
    return champ && estDateSansHeure(champ) ? versDateTerrain(valeur) : valeur.toISOString();
  }
  if (Array.isArray(valeur)) return valeur.map((v) => versSortie(v, champ));
  if (valeur !== null && typeof valeur === 'object') {
    return Object.fromEntries(
      Object.entries(valeur).map(([cle, v]) => [cle, versSortie(v, cle)]),
    );
  }
  return valeur;
}

/// Entrée : les dates de terrain arrivent en chaîne et doivent devenir des
/// `Date` avant Prisma. Le reste est laissé tel quel — Prisma valide lui-même.
export function versEntree(donnees: Record<string, unknown>): Record<string, unknown> {
  const sortie: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(donnees)) {
    sortie[cle] = estDateSansHeure(cle) ? versDateStockee(valeur) : valeur;
  }
  return sortie;
}
