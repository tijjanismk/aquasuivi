import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/// scrypt de `node:crypto` plutôt qu'argon2 : aucune dépendance native à
/// compiler, ce qui compte pour une installation chez un particulier (D18).
const deriver = promisify(scrypt) as (
  motDePasse: string,
  sel: Buffer,
  longueur: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const N = 16384;
const R = 8;
const P = 1;
const LONGUEUR = 64;

/// Format stocké : `scrypt$N$r$p$sel$empreinte`. Les paramètres voyagent avec
/// l'empreinte : on pourra les durcir sans invalider les mots de passe existants.
export async function hacher(motDePasse: string): Promise<string> {
  const sel = randomBytes(16);
  const empreinte = await deriver(motDePasse, sel, LONGUEUR, { N, r: R, p: P });
  return ['scrypt', N, R, P, sel.toString('base64url'), empreinte.toString('base64url')].join('$');
}

export async function verifier(motDePasse: string, stocke: string): Promise<boolean> {
  const [algo, n, r, p, sel, attendu] = stocke.split('$');
  if (algo !== 'scrypt' || !sel || !attendu) return false;
  const cible = Buffer.from(attendu, 'base64url');
  const obtenu = await deriver(motDePasse, Buffer.from(sel, 'base64url'), cible.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(obtenu, cible);
}

/// Empreinte factice : un identifiant inconnu coûte le même calcul qu'un
/// mauvais mot de passe, sans quoi le temps de réponse révèle les comptes.
export const EMPREINTE_LEURRE = await hacher('leurre-jamais-valide');
