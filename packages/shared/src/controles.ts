/**
 * Contrôles de cohérence d'une saisie de terrain.
 *
 * Ici plutôt que dans l'API (D1) : la PWA doit refuser la même saisie hors
 * ligne, sans attendre la synchronisation pour découvrir qu'une pesée est
 * datée d'avant la mise en charge.
 *
 * Chaque fonction est pure et renvoie la liste des violations — vide si tout
 * va bien. Le `code` est stable (interface bilingue), le message est en
 * français.
 */

import type { DateISO } from './types.js';
import { ajouterJours, estAvant } from './dates.js';

export interface Violation {
  code: string;
  champ?: string;
  message: string;
}

/** Bornes du cycle auquel une opération se rattache. */
export interface BornesCycle {
  dateMiseEnCharge: DateISO;
  dateCloture?: DateISO | null;
}

type Nombre = number | null | undefined;

/**
 * Une journée de tolérance sur « aujourd'hui » : le téléphone et le serveur
 * ne sont pas toujours dans le même fuseau, et une saisie faite juste après
 * minuit ne doit pas être refusée.
 */
function demain(aujourdhui: DateISO): DateISO {
  return ajouterJours(aujourdhui, 1);
}

function dateDansLeCycle(
  date: DateISO | null | undefined,
  champ: string,
  cycle: BornesCycle,
  aujourdhui: DateISO,
  { avantChargeAutorisee = false } = {},
): Violation[] {
  if (!date) return [];
  const v: Violation[] = [];
  if (estAvant(demain(aujourdhui), date)) {
    v.push({ code: 'DATE_FUTURE', champ, message: 'La date ne peut pas être dans le futur.' });
  }
  if (!avantChargeAutorisee && estAvant(date, cycle.dateMiseEnCharge)) {
    v.push({
      code: 'DATE_AVANT_MISE_EN_CHARGE',
      champ,
      message: `La date précède la mise en charge du cycle (${cycle.dateMiseEnCharge}).`,
    });
  }
  if (cycle.dateCloture && estAvant(cycle.dateCloture, date)) {
    v.push({
      code: 'DATE_APRES_CLOTURE',
      champ,
      message: `La date suit la clôture du cycle (${cycle.dateCloture}).`,
    });
  }
  return v;
}

function strictementPositif(valeur: Nombre, champ: string, libelle: string): Violation[] {
  if (valeur === null || valeur === undefined) return [];
  return valeur > 0
    ? []
    : [{ code: 'VALEUR_NON_POSITIVE', champ, message: `${libelle} doit être supérieur à zéro.` }];
}

function positifOuNul(valeur: Nombre, champ: string, libelle: string): Violation[] {
  if (valeur === null || valeur === undefined) return [];
  return valeur >= 0
    ? []
    : [{ code: 'VALEUR_NEGATIVE', champ, message: `${libelle} ne peut pas être négatif.` }];
}

function entre(valeur: Nombre, min: number, max: number, champ: string, libelle: string): Violation[] {
  if (valeur === null || valeur === undefined) return [];
  return valeur >= min && valeur <= max
    ? []
    : [
        {
          code: 'VALEUR_HORS_BORNES',
          champ,
          message: `${libelle} doit être compris entre ${min} et ${max}.`,
        },
      ];
}

function requis(valeur: unknown, champ: string, libelle: string): Violation[] {
  return valeur === null || valeur === undefined || valeur === ''
    ? [{ code: 'CHAMP_REQUIS', champ, message: `${libelle} est obligatoire.` }]
    : [];
}

// -----------------------------------------------------------------------------
//  Infrastructure
// -----------------------------------------------------------------------------

export function controlerInfrastructure(i: {
  longueur?: Nombre;
  largeur?: Nombre;
  diametre?: Nombre;
  profondeur?: Nombre;
  niveauRemplissage?: Nombre;
}): Violation[] {
  return [
    ...strictementPositif(i.longueur, 'longueur', 'La longueur'),
    ...strictementPositif(i.largeur, 'largeur', 'La largeur'),
    ...strictementPositif(i.diametre, 'diametre', 'Le diamètre'),
    ...strictementPositif(i.profondeur, 'profondeur', 'La profondeur'),
    ...entre(i.niveauRemplissage, 1, 100, 'niveauRemplissage', 'Le niveau de remplissage (%)'),
  ];
}

// -----------------------------------------------------------------------------
//  Cycle
// -----------------------------------------------------------------------------

export interface ContexteCycle {
  aujourdhui: DateISO;
  /** Une infrastructure désactivée ne reçoit plus de nouveau cycle. */
  infrastructureActive: boolean;
  /** Clôture du cycle précédent sur la même infrastructure. */
  cloturePrecedente?: DateISO | null;
  /** Mise en charge du cycle suivant, quand on modifie un cycle ancien. */
  miseEnChargeSuivante?: DateISO | null;
  /** Première et dernière opération déjà saisies (hors dépenses préalables). */
  premiereOperation?: DateISO | null;
  derniereOperation?: DateISO | null;
  /** Vrai à la création, pour ne pas bloquer la retouche d'un cycle ancien. */
  creation: boolean;
  /**
   * Un autre cycle est ouvert sur ce bassin. En base, un index unique le
   * garantit (D7) ; hors ligne, seul ce contrôle l'attrape avant la sync.
   */
  autreCycleOuvert?: boolean;
}

export function controlerCycle(
  c: { dateMiseEnCharge?: DateISO | null; dateCloture?: DateISO | null; statut?: string | null },
  ctx: ContexteCycle,
): Violation[] {
  const v: Violation[] = [...requis(c.dateMiseEnCharge, 'dateMiseEnCharge', 'La date de mise en charge')];
  if (!c.dateMiseEnCharge) return v;

  if (ctx.creation && !ctx.infrastructureActive) {
    v.push({
      code: 'INFRASTRUCTURE_INACTIVE',
      champ: 'infrastructureId',
      message: 'Cette infrastructure est désactivée : on ne peut plus y ouvrir de cycle.',
    });
  }
  if (estAvant(demain(ctx.aujourdhui), c.dateMiseEnCharge)) {
    v.push({ code: 'DATE_FUTURE', champ: 'dateMiseEnCharge', message: 'La mise en charge ne peut pas être dans le futur.' });
  }
  if (c.dateCloture && estAvant(demain(ctx.aujourdhui), c.dateCloture)) {
    v.push({ code: 'DATE_FUTURE', champ: 'dateCloture', message: 'La clôture ne peut pas être dans le futur.' });
  }
  if (c.dateCloture && estAvant(c.dateCloture, c.dateMiseEnCharge)) {
    v.push({
      code: 'CYCLE_CLOTURE_AVANT_CHARGE',
      champ: 'dateCloture',
      message: 'La date de clôture ne peut pas précéder la date de mise en charge.',
    });
  }

  // Statut et date de clôture disent la même chose, et c'est la date que
  // l'index « un seul cycle ouvert » regarde. S'ils divergent, un cycle
  // « bouclé » bloque le bassin, ou deux cycles « en cours » s'y superposent.
  if (c.statut === 'BOUCLE' && !c.dateCloture) {
    v.push({ code: 'CLOTURE_SANS_DATE', champ: 'dateCloture', message: 'Un cycle bouclé doit avoir une date de clôture.' });
  }
  if (c.statut && c.statut !== 'BOUCLE' && c.dateCloture) {
    v.push({
      code: 'DATE_CLOTURE_SUR_CYCLE_OUVERT',
      champ: 'statut',
      message: 'Une date de clôture est renseignée : le statut doit être « bouclé ».',
    });
  }

  if (!c.dateCloture && ctx.autreCycleOuvert) {
    v.push({
      code: 'CYCLE_DEJA_OUVERT',
      champ: 'infrastructureId',
      message: "Cette infrastructure a déjà un cycle ouvert. Clôturez-le avant d'en ouvrir un autre.",
    });
  }

  // Deux cycles ne se chevauchent pas dans le même bassin.
  if (ctx.cloturePrecedente && estAvant(c.dateMiseEnCharge, ctx.cloturePrecedente)) {
    v.push({
      code: 'CHEVAUCHEMENT_CYCLES',
      champ: 'dateMiseEnCharge',
      message: `Le cycle précédent de ce bassin n'est clôturé que le ${ctx.cloturePrecedente}.`,
    });
  }
  if (ctx.miseEnChargeSuivante && c.dateCloture && estAvant(ctx.miseEnChargeSuivante, c.dateCloture)) {
    v.push({
      code: 'CHEVAUCHEMENT_CYCLES',
      champ: 'dateCloture',
      message: `Le cycle suivant de ce bassin commence le ${ctx.miseEnChargeSuivante}.`,
    });
  }

  // Déplacer les bornes ne doit pas laisser d'opérations dehors.
  if (ctx.premiereOperation && estAvant(ctx.premiereOperation, c.dateMiseEnCharge)) {
    v.push({
      code: 'OPERATIONS_AVANT_MISE_EN_CHARGE',
      champ: 'dateMiseEnCharge',
      message: `Une opération est déjà saisie le ${ctx.premiereOperation}, avant cette mise en charge.`,
    });
  }
  if (ctx.derniereOperation && c.dateCloture && estAvant(c.dateCloture, ctx.derniereOperation)) {
    v.push({
      code: 'OPERATIONS_APRES_CLOTURE',
      champ: 'dateCloture',
      message: `Une opération est saisie le ${ctx.derniereOperation}, après cette clôture.`,
    });
  }
  return v;
}

// -----------------------------------------------------------------------------
//  Opérations d'un cycle
// -----------------------------------------------------------------------------

export function controlerLot(
  l: { nombre?: Nombre; poidsMoyenG?: Nombre; coutUnitaire?: Nombre; dateMiseEnCharge?: DateISO | null },
  cycle: BornesCycle,
  aujourdhui: DateISO,
): Violation[] {
  return [
    ...requis(l.nombre, 'nombre', 'Le nombre de poissons'),
    ...strictementPositif(l.nombre, 'nombre', 'Le nombre de poissons'),
    ...strictementPositif(l.poidsMoyenG, 'poidsMoyenG', 'Le poids moyen'),
    ...positifOuNul(l.coutUnitaire, 'coutUnitaire', 'Le coût unitaire'),
    ...dateDansLeCycle(l.dateMiseEnCharge, 'dateMiseEnCharge', cycle, aujourdhui),
  ];
}

export interface ContexteMortalite {
  lot: { nombre: number; dateMiseEnCharge: DateISO };
  /** Cumul des **autres** mortalités du lot (hors la ligne contrôlée). */
  autres: { nombre: number; remplacement: number };
  /** Poissons du lot déjà sortis par récolte, quand le nombre est connu. */
  recoltes: number;
}

/**
 * On ne peut pas perdre plus de poissons qu'il n'en reste. Les
 * remplacements remettent des poissons dans le lot, d'où leur ajout.
 */
export function controlerMortalite(
  m: { nombre?: Nombre; remplacement?: Nombre; coutUnitaire?: Nombre; dateConstat?: DateISO | null },
  ctx: ContexteMortalite,
  cycle: BornesCycle,
  aujourdhui: DateISO,
): Violation[] {
  const v: Violation[] = [
    ...requis(m.nombre, 'nombre', 'Le nombre de morts'),
    ...positifOuNul(m.nombre, 'nombre', 'Le nombre de morts'),
    ...positifOuNul(m.remplacement, 'remplacement', 'Le remplacement'),
    ...positifOuNul(m.coutUnitaire, 'coutUnitaire', 'Le coût unitaire'),
    ...dateDansLeCycle(m.dateConstat, 'dateConstat', cycle, aujourdhui),
  ];
  if (m.dateConstat && estAvant(m.dateConstat, ctx.lot.dateMiseEnCharge)) {
    v.push({
      code: 'MORTALITE_AVANT_LOT',
      champ: 'dateConstat',
      message: `Le lot n'est mis en charge que le ${ctx.lot.dateMiseEnCharge}.`,
    });
  }
  const disponible =
    ctx.lot.nombre + ctx.autres.remplacement + (m.remplacement ?? 0) - ctx.autres.nombre - ctx.recoltes;
  if ((m.nombre ?? 0) > disponible) {
    v.push({
      code: 'MORTALITE_SUPERIEURE_EFFECTIF',
      champ: 'nombre',
      message: `Il ne reste que ${Math.max(disponible, 0)} poisson(s) dans ce lot.`,
    });
  }
  return v;
}

export function controlerPesee(
  p: { dateOperation?: DateISO | null; tauxRationPct?: Nombre },
  cycle: BornesCycle,
  aujourdhui: DateISO,
): Violation[] {
  return [
    ...requis(p.dateOperation, 'dateOperation', 'La date de pesée'),
    ...entre(p.tauxRationPct, 0, 10, 'tauxRationPct', 'Le taux de rationnement (%)'),
    ...dateDansLeCycle(p.dateOperation, 'dateOperation', cycle, aujourdhui),
  ];
}

/** Au-delà, c'est presque toujours des grammes saisis comme des kilos. */
const POIDS_INDIVIDUEL_MAX_G = 20000;

export function controlerEchantillon(e: { nombre?: Nombre; poidsTotalG?: Nombre }): Violation[] {
  const v: Violation[] = [
    ...requis(e.nombre, 'nombre', 'Le nombre de poissons pesés'),
    ...strictementPositif(e.nombre, 'nombre', 'Le nombre de poissons pesés'),
    ...requis(e.poidsTotalG, 'poidsTotalG', 'Le poids total'),
    ...strictementPositif(e.poidsTotalG, 'poidsTotalG', 'Le poids total'),
  ];
  if (e.nombre && e.poidsTotalG && e.nombre > 0 && e.poidsTotalG / e.nombre > POIDS_INDIVIDUEL_MAX_G) {
    v.push({
      code: 'POIDS_INVRAISEMBLABLE',
      champ: 'poidsTotalG',
      message: `Plus de ${POIDS_INDIVIDUEL_MAX_G / 1000} kg par poisson : le poids est-il bien en grammes ?`,
    });
  }
  return v;
}

export function controlerDistribution(
  d: {
    dateDebut?: DateISO | null;
    dateFin?: DateISO | null;
    quantiteTotaleKg?: Nombre;
    rationKgJour?: Nombre;
    prixKgApplique?: Nombre;
  },
  cycle: BornesCycle,
  aujourdhui: DateISO,
): Violation[] {
  // La ration fixée à la pêche suffit : la quantité s'en déduit (D29). La
  // quantité mesurée, quand on la connaît, la remplace.
  const sansQuantite = d.quantiteTotaleKg === null || d.quantiteTotaleKg === undefined;
  const sansRation = d.rationKgJour === null || d.rationKgJour === undefined;
  const v: Violation[] = [
    ...(sansQuantite && sansRation
      ? [{ code: 'CHAMP_REQUIS', champ: 'rationKgJour', message: 'Indiquez la ration journalière ou la quantité distribuée.' }]
      : []),
    ...strictementPositif(d.quantiteTotaleKg, 'quantiteTotaleKg', 'La quantité distribuée'),
    ...positifOuNul(d.rationKgJour, 'rationKgJour', 'La ration journalière'),
    ...positifOuNul(d.prixKgApplique, 'prixKgApplique', 'Le prix au kilo'),
    ...dateDansLeCycle(d.dateDebut, 'dateDebut', cycle, aujourdhui),
    ...dateDansLeCycle(d.dateFin, 'dateFin', cycle, aujourdhui),
  ];
  if (d.dateDebut && d.dateFin && estAvant(d.dateFin, d.dateDebut)) {
    v.push({ code: 'PERIODE_INVERSEE', champ: 'dateFin', message: 'La fin de période précède son début.' });
  }
  return v;
}

export function controlerTraitement(
  t: { dateOperation?: DateISO | null; quantite?: Nombre; prixUnitaire?: Nombre },
  cycle: BornesCycle,
  aujourdhui: DateISO,
): Violation[] {
  return [
    ...requis(t.dateOperation, 'dateOperation', 'La date du traitement'),
    ...strictementPositif(t.quantite, 'quantite', 'La quantité'),
    ...positifOuNul(t.prixUnitaire, 'prixUnitaire', 'Le prix unitaire'),
    ...dateDansLeCycle(t.dateOperation, 'dateOperation', cycle, aujourdhui),
  ];
}

export interface ContexteRecolte {
  /** Espèce du lot récolté, pour refuser un lot d'une autre espèce. */
  especeLot?: string | null;
  /**
   * Poissons encore en bassin pour ce lot (ou le cycle) hors cette récolte,
   * `null` si inconnu. Seules les récoltes dont le nombre est saisi comptent.
   */
  effectifRestant?: number | null;
}

export function controlerRecolte(
  r: {
    dateOperation?: DateISO | null;
    poidsKg?: Nombre;
    nombre?: Nombre;
    prixKg?: Nombre;
    especeId?: string | null;
  },
  ctx: ContexteRecolte,
  cycle: BornesCycle,
  aujourdhui: DateISO,
): Violation[] {
  const v: Violation[] = [
    ...requis(r.dateOperation, 'dateOperation', 'La date de récolte'),
    ...requis(r.poidsKg, 'poidsKg', 'Le poids récolté'),
    ...strictementPositif(r.poidsKg, 'poidsKg', 'Le poids récolté'),
    ...strictementPositif(r.nombre, 'nombre', 'Le nombre de poissons'),
    ...positifOuNul(r.prixKg, 'prixKg', 'Le prix au kilo'),
    ...dateDansLeCycle(r.dateOperation, 'dateOperation', cycle, aujourdhui),
  ];
  if (r.especeId && ctx.especeLot && r.especeId !== ctx.especeLot) {
    v.push({ code: 'ESPECE_DIFFERENTE_DU_LOT', champ: 'especeId', message: "L'espèce récoltée n'est pas celle du lot." });
  }
  if (r.nombre && ctx.effectifRestant != null && r.nombre > ctx.effectifRestant) {
    v.push({
      code: 'RECOLTE_SUPERIEURE_EFFECTIF',
      champ: 'nombre',
      message: `Il ne reste que ${Math.max(ctx.effectifRestant, 0)} poisson(s) en bassin.`,
    });
  }
  return v;
}

/**
 * Une dépense peut précéder la mise en charge — chaulage, fumure, réparation
 * de digue font partie du coût du cycle — mais pas suivre sa clôture.
 */
export function controlerDepense(
  d: { montant?: Nombre; dateOperation?: DateISO | null },
  cycle: BornesCycle,
  aujourdhui: DateISO,
): Violation[] {
  return [
    ...requis(d.montant, 'montant', 'Le montant'),
    ...strictementPositif(d.montant, 'montant', 'Le montant'),
    ...requis(d.dateOperation, 'dateOperation', 'La date'),
    ...dateDansLeCycle(d.dateOperation, 'dateOperation', cycle, aujourdhui, {
      avantChargeAutorisee: true,
    }),
  ];
}

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Bornes physiques, pas agronomiques : elles attrapent les fautes de frappe. */
export function controlerMesureEau(
  m: {
    dateMesure?: DateISO | null;
    heure?: string | null;
    temperature?: Nombre;
    oxygeneDissous?: Nombre;
    ph?: Nombre;
    transparenceSecchi?: Nombre;
    ammoniacNh3?: Nombre;
    nitrites?: Nombre;
    alcalinite?: Nombre;
    salinite?: Nombre;
  },
  cycle: BornesCycle | null,
  aujourdhui: DateISO,
): Violation[] {
  const v: Violation[] = [
    ...requis(m.dateMesure, 'dateMesure', 'La date de mesure'),
    ...entre(m.temperature, 0, 45, 'temperature', 'La température (°C)'),
    ...entre(m.oxygeneDissous, 0, 30, 'oxygeneDissous', "L'oxygène dissous (mg/L)"),
    ...entre(m.ph, 0, 14, 'ph', 'Le pH'),
    ...entre(m.transparenceSecchi, 0, 500, 'transparenceSecchi', 'La transparence (cm)'),
    ...positifOuNul(m.ammoniacNh3, 'ammoniacNh3', "L'ammoniac"),
    ...positifOuNul(m.nitrites, 'nitrites', 'Les nitrites'),
    ...positifOuNul(m.alcalinite, 'alcalinite', "L'alcalinité"),
    ...positifOuNul(m.salinite, 'salinite', 'La salinité'),
  ];
  if (m.heure && !HEURE.test(m.heure)) {
    v.push({ code: 'HEURE_INVALIDE', champ: 'heure', message: "L'heure s'écrit HH:MM, par exemple 06:30." });
  }
  if (cycle) v.push(...dateDansLeCycle(m.dateMesure, 'dateMesure', cycle, aujourdhui));
  else if (m.dateMesure && estAvant(demain(aujourdhui), m.dateMesure)) {
    v.push({ code: 'DATE_FUTURE', champ: 'dateMesure', message: 'La date ne peut pas être dans le futur.' });
  }
  return v;
}
