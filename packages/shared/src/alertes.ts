/**
 * Moteur d'alertes (étape 8).
 *
 * Les seuils vivent en base, sur l'espèce (D10) ; ce module les interprète.
 * Ici plutôt que dans l'API (D1) : la PWA doit prévenir d'un manque
 * d'oxygène au bord du bassin, sans attendre le réseau.
 *
 * Une alerte ne bloque jamais une saisie : elle dit ce qui mérite un geste.
 */

import type { CycleComplet, DateISO, Espece } from './types.js';
import { calculerIndicateurs, type Indicateurs } from './indicateurs.js';
import { joursEntre } from './dates.js';

export type NiveauAlerte = 'info' | 'attention' | 'critique';

export interface Alerte {
  /// Code stable, pour l'interface bilingue et les filtres.
  code: string;
  niveau: NiveauAlerte;
  message: string;
  valeur?: number | null;
  seuil?: number | null;
}

export interface MesureEauAlerte {
  dateMesure: DateISO;
  heure?: string | null;
  temperature?: number | null;
  oxygeneDissous?: number | null;
  ph?: number | null;
}

export interface ContexteAlertes {
  aujourdhui: DateISO;
  /// Relevés d'eau du bassin pendant le cycle.
  mesures?: MesureEauAlerte[];
}

/** Coefficient de variation au-delà duquel un tri s'impose, faute de seuil propre à l'espèce. */
export const SEUIL_HETEROGENEITE_DEFAUT = 25;
/** Une pêche de contrôle par mois : au-delà, ration et indicateurs reposent sur un poids périmé. */
export const DELAI_PESEE_JOURS = 30;
/** Plage de pH tolérée par les poissons d'élevage courants. */
export const PH_MIN = 6.5;
export const PH_MAX = 9;

const ORDRE: Record<NiveauAlerte, number> = { critique: 0, attention: 1, info: 2 };
const arrondi = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const fr = (v: number, d = 1) => String(arrondi(v, d)).replace('.', ',');

/** Espèce qui fait foi pour les seuils : celle du lot le plus nombreux. */
function especePrincipale(d: CycleComplet, i: Indicateurs): Espece | undefined {
  const lot = [...i.lots].sort((a, b) => b.effectif - a.effectif)[0];
  const id = lot?.lot.especeId ?? d.cycle.especeId;
  return d.especes.find((e) => e.id === id);
}

/** Dernier relevé qui renseigne le champ voulu. */
function dernier(mesures: MesureEauAlerte[], champ: keyof MesureEauAlerte) {
  return [...mesures]
    .filter((m) => m[champ] !== null && m[champ] !== undefined)
    .sort((a, b) => `${a.dateMesure}${a.heure ?? ''}`.localeCompare(`${b.dateMesure}${b.heure ?? ''}`))
    .at(-1);
}

export function calculerAlertes(
  d: CycleComplet,
  ctx: ContexteAlertes,
  indicateurs: Indicateurs = calculerIndicateurs(d),
): Alerte[] {
  const i = indicateurs;
  const a: Alerte[] = [];
  const ouvert = !d.cycle.dateCloture;
  const espece = especePrincipale(d, i);

  // --- Sécurité sanitaire : toujours, même sur un cycle bouclé ---
  if (i.conformite.recoltesNonConformes > 0) {
    a.push({
      code: 'RECOLTE_EN_DELAI_ATTENTE',
      niveau: 'critique',
      message: `${i.conformite.recoltesNonConformes} récolte(s) faite(s) pendant un délai d’attente sanitaire : ce poisson ne devait pas être consommé.`,
      valeur: i.conformite.recoltesNonConformes,
    });
  }
  if (ouvert && i.conformite.finDelaiAttente && i.conformite.finDelaiAttente > ctx.aujourdhui) {
    a.push({
      code: 'TRAITEMENT_EN_COURS',
      niveau: 'info',
      message: `Traitement en cours : pas de récolte avant le ${i.conformite.finDelaiAttente.split('-').reverse().join('/')}.`,
    });
  }

  if (ouvert && i.zootechnie.effectifFinal > 0) {
    // --- Densité ---
    const parM3 = d.infrastructure.mesureBase === 'VOLUME';
    const mesure = parM3 ? d.infrastructure.volume : d.infrastructure.superficie;
    const max = parM3 ? espece?.densiteMaxM3 : espece?.densiteMaxM2;
    if (mesure && mesure > 0 && max && max > 0) {
      const densite = i.zootechnie.effectifFinal / mesure;
      if (densite > max) {
        const unite = parM3 ? 'm³' : 'm²';
        a.push({
          code: 'DENSITE_EXCESSIVE',
          niveau: densite > max * 1.2 ? 'critique' : 'attention',
          message: `${fr(densite)} poissons/${unite} pour un maximum de ${fr(max)} : desserrez le bassin (vente, transfert) avant que l’oxygène ne manque.`,
          valeur: arrondi(densite),
          seuil: max,
        });
      }
    }

    // --- Eau ---
    const mesures = ctx.mesures ?? [];
    const o2 = dernier(mesures, 'oxygeneDissous');
    if (o2 && espece?.oxygeneMin != null && o2.oxygeneDissous! < espece.oxygeneMin) {
      a.push({
        code: 'OXYGENE_BAS',
        niveau: 'critique',
        message: `Oxygène à ${fr(o2.oxygeneDissous!)} mg/L le ${o2.dateMesure.split('-').reverse().join('/')}, sous le minimum de ${fr(espece.oxygeneMin)} : aérez, renouvelez l’eau, réduisez l’aliment.`,
        valeur: o2.oxygeneDissous!,
        seuil: espece.oxygeneMin,
      });
    }
    const t = dernier(mesures, 'temperature');
    if (t && espece) {
      const temp = t.temperature!;
      if ((espece.temperatureMin != null && temp < espece.temperatureMin) || (espece.temperatureMax != null && temp > espece.temperatureMax)) {
        a.push({
          code: 'TEMPERATURE_LETALE',
          niveau: 'critique',
          message: `Eau à ${fr(temp)} °C, hors de la plage supportée par l’espèce (${fr(espece.temperatureMin ?? 0)}–${fr(espece.temperatureMax ?? 0)} °C).`,
          valeur: temp,
        });
      } else if ((espece.temperatureOptMin != null && temp < espece.temperatureOptMin) || (espece.temperatureOptMax != null && temp > espece.temperatureOptMax)) {
        a.push({
          code: 'TEMPERATURE_HORS_OPTIMUM',
          niveau: 'attention',
          message: `Eau à ${fr(temp)} °C, hors de l’optimum (${fr(espece.temperatureOptMin ?? 0)}–${fr(espece.temperatureOptMax ?? 0)} °C) : l’appétit baisse, adaptez la ration.`,
          valeur: temp,
        });
      }
    }
    const ph = dernier(mesures, 'ph');
    if (ph && (ph.ph! < PH_MIN || ph.ph! > PH_MAX)) {
      a.push({
        code: 'PH_HORS_PLAGE',
        niveau: 'attention',
        message: `pH à ${fr(ph.ph!)}, hors de la plage ${fr(PH_MIN)}–${fr(PH_MAX)} : chaulage ou renouvellement d’eau à envisager.`,
        valeur: ph.ph!,
      });
    }

    // --- Suivi ---
    const derniere = [...d.pesees].sort((x, y) => x.dateOperation.localeCompare(y.dateOperation)).at(-1);
    const depuis = joursEntre(derniere?.dateOperation ?? d.cycle.dateMiseEnCharge, ctx.aujourdhui);
    if (depuis > DELAI_PESEE_JOURS) {
      a.push({
        code: 'PESEE_EN_RETARD',
        niveau: 'info',
        message: `Dernière pêche de contrôle il y a ${depuis} jours : la ration conseillée repose sur un poids périmé.`,
        valeur: depuis,
        seuil: DELAI_PESEE_JOURS,
      });
    }
  }

  // --- Performances (cycle en cours ou bouclé : le bilan compte aussi) ---
  if (i.zootechnie.nombrePesees > 0 && i.zootechnie.performance !== null && i.zootechnie.performance < 1) {
    a.push({
      code: 'CROISSANCE_LENTE',
      niveau: 'attention',
      message: `Croissance à ${Math.round(i.zootechnie.performance * 100)} % de la référence de l’espèce : vérifiez ration, oxygène et densité.`,
      valeur: i.zootechnie.performance,
      seuil: 1,
    });
  }
  const seuilCv = espece?.seuilHeterogeneitePct ?? SEUIL_HETEROGENEITE_DEFAUT;
  if (i.zootechnie.coefficientVariationPct !== null && i.zootechnie.coefficientVariationPct > seuilCv) {
    a.push({
      code: 'LOT_HETEROGENE',
      niveau: 'attention',
      message: `Tailles très inégales (variation de ${fr(i.zootechnie.coefficientVariationPct)} %) : un tri évite que les gros ne privent les petits${/clarias/i.test(espece?.nom ?? '') ? ' — et le cannibalisme' : ''}.`,
      valeur: i.zootechnie.coefficientVariationPct,
      seuil: seuilCv,
    });
  }
  // Référence stockée en fraction (0,9) ou en pourcentage (90) selon la source.
  const survieRef = espece?.tauxSurvieRef != null ? (espece.tauxSurvieRef <= 1 ? espece.tauxSurvieRef * 100 : espece.tauxSurvieRef) : null;
  if (survieRef !== null && i.zootechnie.tauxSurviePct !== null && i.zootechnie.tauxSurviePct < survieRef - 10) {
    a.push({
      code: 'MORTALITE_ELEVEE',
      niveau: 'attention',
      message: `Survie de ${fr(i.zootechnie.tauxSurviePct)} % pour une référence de ${fr(survieRef)} % : cherchez la cause (eau, maladie, prédateurs).`,
      valeur: i.zootechnie.tauxSurviePct,
      seuil: survieRef,
    });
  }
  const icRef = espece?.indiceConsommationRef;
  if (icRef && i.alimentation.indiceConsommation !== null && i.alimentation.indiceConsommation > icRef * 1.25) {
    a.push({
      code: 'ALIMENT_MAL_VALORISE',
      niveau: 'attention',
      message: `Indice de consommation de ${fr(i.alimentation.indiceConsommation, 2)} pour une référence de ${fr(icRef, 2)} : de l’aliment est perdu, réduisez les rations ou vérifiez l’aliment.`,
      valeur: i.alimentation.indiceConsommation,
      seuil: icRef,
    });
  }

  return a.sort((x, y) => ORDRE[x.niveau] - ORDRE[y.niveau]);
}
