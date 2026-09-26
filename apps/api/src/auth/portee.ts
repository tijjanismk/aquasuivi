import type { NiveauAcces, Prisma } from '@prisma/client';
import type { UtilisateurConnecte } from './garde.js';

/// Fermes qu'un utilisateur atteint (D18). `null` : aucune restriction.
///
/// Calculé à chaque requête depuis `AccesFerme`, jamais porté par le jeton :
/// retirer un encadreur d'une ferme prend effet immédiatement.
export type PorteeFerme = Prisma.FermeWhereInput | null;

function accesEnCours(userId: string, niveaux?: NiveauAcces[]): Prisma.FermeWhereInput {
  const aujourdhui = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  return {
    acces: {
      some: {
        userId,
        ...(niveaux ? { niveau: { in: niveaux } } : {}),
        AND: [
          { OR: [{ debutLe: null }, { debutLe: { lte: aujourdhui } }] },
          { OR: [{ finLe: null }, { finLe: { gte: aujourdhui } }] },
        ],
      },
    },
  };
}

export function fermesLisibles(u: UtilisateurConnecte): PorteeFerme {
  switch (u.role) {
    case 'ADMIN':
    case 'NATIONAL':
      return null;
    case 'REGION':
    case 'SECTEUR':
      // Sans région renseignée, un profil territorial ne lit que ses accès explicites.
      return u.regionId
        ? { OR: [{ regionId: u.regionId }, accesEnCours(u.id)] }
        : accesEnCours(u.id);
    default:
      return accesEnCours(u.id);
  }
}

/// Écrire suppose un accès PROPRIETAIRE ou ENCADREUR, quel que soit le rôle :
/// les profils territoriaux consultent, ils ne saisissent pas.
export function fermesModifiables(u: UtilisateurConnecte): PorteeFerme {
  if (u.role === 'ADMIN') return null;
  return accesEnCours(u.id, ['PROPRIETAIRE', 'ENCADREUR']);
}

/// Niveau attribué à qui crée une ferme. L'administrateur crée pour autrui
/// et ne s'attribue rien.
export function niveauCreateur(u: UtilisateurConnecte): NiveauAcces | null {
  if (u.role === 'ADMIN') return null;
  return u.role === 'PISCICULTEUR' ? 'PROPRIETAIRE' : 'ENCADREUR';
}
