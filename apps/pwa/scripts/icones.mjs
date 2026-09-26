// Icônes PNG du manifeste, redessinées depuis la même géométrie que
// `public/icone.svg`. Sans dépendance : un rastériseur de SVG pèserait plus
// lourd que ces quelques formes, et Chrome exige du PNG pour l'installation.
//
//   node scripts/icones.mjs

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FOND = [0x1f, 0x6f, 0x5f];
const CLAIR = [0xf7, 0xfb, 0xf8];

/// Couleur d'un point de la grille 512 × 512 de l'icône SVG.
function couleur(x, y) {
  // Coins arrondis (rx = 112) : transparent hors du carré.
  const r = 112;
  const cx = x < r ? r : x > 512 - r ? 512 - r : x;
  const cy = y < r ? r : y > 512 - r ? 512 - r : y;
  if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return null;

  if ((x - 176) ** 2 + (y - 208) ** 2 <= 14 ** 2) return FOND; // œil
  if (((x - 236) / 128) ** 2 + ((y - 226) / 74) ** 2 <= 1) return CLAIR; // corps
  // Queue : triangle (348,226) (430,164) (430,288).
  if (x >= 348 && x <= 430) {
    const demi = ((x - 348) / 82) * 62;
    if (Math.abs(y - 226) <= demi) return CLAIR;
  }
  // Vague : sinusoïde d'épaisseur 22 entre x = 96 et x = 416.
  if (x >= 85 && x <= 427) {
    const t = Math.min(Math.max(x, 96), 416);
    const vague = 368 - 22 * Math.sin(((t - 96) / 80) * Math.PI);
    if (Math.abs(y - vague) <= 11 && (x >= 96 || (x - 96) ** 2 + (y - 368) ** 2 <= 121)) return CLAIR;
    if (x > 416 && (x - 416) ** 2 + (y - 368) ** 2 <= 121) return CLAIR;
  }
  return FOND;
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(tampon) {
  let c = 0xffffffff;
  for (const octet of tampon) c = CRC[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloc(type, donnees) {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length);
  const corps = Buffer.concat([Buffer.from(type), donnees]);
  const somme = Buffer.alloc(4);
  somme.writeUInt32BE(crc32(corps));
  return Buffer.concat([longueur, corps, somme]);
}

function png(taille) {
  const echelle = 512 / taille;
  const lignes = [];
  for (let y = 0; y < taille; y++) {
    const ligne = Buffer.alloc(1 + taille * 4);
    for (let x = 0; x < taille; x++) {
      // Suréchantillonnage 3 × 3 : bords lisses sans bibliothèque.
      let r = 0, v = 0, b = 0, a = 0;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const c = couleur((x + (i + 0.5) / 3) * echelle, (y + (j + 0.5) / 3) * echelle);
          if (c) { r += c[0]; v += c[1]; b += c[2]; a += 1; }
        }
      }
      const o = 1 + x * 4;
      if (a) {
        ligne[o] = Math.round(r / a);
        ligne[o + 1] = Math.round(v / a);
        ligne[o + 2] = Math.round(b / a);
      }
      ligne[o + 3] = Math.round((a / 9) * 255);
    }
    lignes.push(ligne);
  }
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(taille, 0);
  entete.writeUInt32BE(taille, 4);
  entete[8] = 8; // bits par canal
  entete[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', entete),
    bloc('IDAT', deflateSync(Buffer.concat(lignes))),
    bloc('IEND', Buffer.alloc(0)),
  ]);
}

const publics = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
for (const taille of [192, 512]) {
  writeFileSync(path.join(publics, `icone-${taille}.png`), png(taille));
  console.log(`icone-${taille}.png`);
}
