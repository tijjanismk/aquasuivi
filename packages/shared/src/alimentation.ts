/**
 * Aliment distribué sur une période (D29).
 *
 * Sur le terrain, la pêche de contrôle fixe une ration journalière — biomasse
 * × taux — qui court jusqu'à la pêche suivante (tableur Kotouba : ration 2
 * fixée à la pêche 1, ration 3 à la pêche 2…). Personne ne pèse l'aliment de
 * chaque jour : la quantité de la période se déduit de la ration et du nombre
 * de jours. Quand elle est connue (sacs comptés), la quantité réelle prime,
 * comme la récolte pesée prime sur l'estimation (D14).
 */

import { ajouterJours, joursEntre } from './dates.js';
import type { DateISO, Distribution, Pesee } from './types.js';

const arrondi = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

export interface ContexteDistribution {
  /** Pêches de contrôle du cycle : la suivante clôt la ration en cours. */
  pesees: Pick<Pesee, 'dateOperation'>[];
  dateCloture?: DateISO | null;
  /** Sans elle, une ration encore ouverte ne compte aucun jour. */
  aujourdhui?: DateISO | null;
}

export interface QuantiteDistribuee {
  kg: number;
  /** Jours couverts par la ration ; `null` quand la quantité est saisie. */
  jours: number | null;
  /** Vrai quand la quantité vient de la ration, faux quand elle est mesurée. */
  estimee: boolean;
  /** Ration qui court encore : ni fin, ni pêche suivante, ni clôture. */
  enCours: boolean;
}

/**
 * Quantité d'aliment d'une distribution.
 *
 * Fin de la ration, premier jour **non** nourri à cette ration :
 *  1. le lendemain de `dateFin` si elle est saisie (dernier jour inclus) ;
 *  2. sinon la pêche de contrôle suivante — le jour de la pêche, la nouvelle
 *     ration prend le relais ;
 *  3. sinon la clôture du cycle ;
 *  4. sinon le lendemain d'aujourd'hui : la ration du jour est comptée.
 * Jamais au-delà de la clôture ni d'aujourd'hui : on ne compte pas l'aliment
 * qui n'a pas encore été donné.
 */
export function quantiteDistribuee(d: Distribution, ctx: ContexteDistribution): QuantiteDistribuee {
  if (d.quantiteTotaleKg != null) {
    return { kg: d.quantiteTotaleKg, jours: null, estimee: false, enCours: false };
  }
  if (d.rationKgJour == null) return { kg: 0, jours: 0, estimee: true, enCours: false };

  const suivante = ctx.pesees
    .map((p) => p.dateOperation)
    .filter((x) => x > d.dateDebut)
    .sort()[0];
  const plafond = ctx.dateCloture ?? (ctx.aujourdhui ? ajouterJours(ctx.aujourdhui, 1) : null);
  const prevue = d.dateFin ? ajouterJours(d.dateFin, 1) : (suivante ?? null);
  const fin = [prevue, plafond].filter((x): x is DateISO => !!x).sort()[0] ?? d.dateDebut;

  const jours = Math.max(0, joursEntre(d.dateDebut, fin));
  return {
    kg: arrondi(d.rationKgJour * jours),
    jours,
    estimee: true,
    enCours: !d.dateFin && !suivante && !ctx.dateCloture,
  };
}
