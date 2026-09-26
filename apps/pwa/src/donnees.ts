import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import {
  aujourdhui,
  calculerAlertes,
  calculerIndicateurs,
  rationConseillee,
  type Alerte,
  type CycleComplet,
  type Indicateurs,
} from '@aqua/shared';
import { db, type Ligne } from './db';

/// Requête IndexedDB suivie en direct : l'écran se met à jour tout seul après
/// une saisie ou une synchronisation. `undefined` pendant le premier chargement.
export function useRequete<T>(requete: () => Promise<T>, dependances: unknown[] = []): T | undefined {
  const [valeur, setValeur] = useState<T>();
  useEffect(() => {
    const abonnement = liveQuery(requete).subscribe({ next: setValeur, error: () => setValeur(undefined) });
    return () => abonnement.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependances);
  return valeur;
}

const nb = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const parDate = <T extends Ligne>(lignes: T[], champ: string) =>
  [...lignes].sort((a, b) => String(a[champ]).localeCompare(String(b[champ])));

/// Agrégat d'un cycle lu dans IndexedDB : même forme que celle que l'API
/// construit depuis PostgreSQL (`cycles.service.ts`). Même entrée, même
/// fonction de calcul (D13) : mêmes chiffres, avec ou sans réseau.
export async function cycleComplet(cycleId: string): Promise<CycleComplet | null> {
  const cycle = await db.cycles.get(cycleId);
  if (!cycle) return null;
  const infra = await db.infrastructures.get(String(cycle['infrastructureId']));
  const type = infra ? await db.typesInfrastructure.get(String(infra['typeInfrastructureId'])) : undefined;
  if (!infra || !type) return null;

  const parCycle = (t: 'lots' | 'pesees' | 'distributions' | 'traitements' | 'recoltes' | 'depenses') =>
    db[t].where('cycleId').equals(cycleId).toArray();
  const [lots, pesees, distributions, traitements, recoltes, depenses] = await Promise.all([
    parCycle('lots'), parCycle('pesees'), parCycle('distributions'),
    parCycle('traitements'), parCycle('recoltes'), parCycle('depenses'),
  ]);
  const mortalites = (await Promise.all(lots.map((l) => db.mortalites.where('lotId').equals(l.id).toArray()))).flat();
  const echantillons = (await Promise.all(pesees.map((p) => db.echantillons.where('peseeId').equals(p.id).toArray()))).flat();
  const especeIds = [...new Set([...lots.map((l) => l['especeId']), cycle['especeId']].filter(Boolean))];
  const especes = (await db.especes.bulkGet(especeIds)).filter((e): e is Ligne => !!e);

  return {
    cycle: {
      id: cycle.id,
      numero: cycle['numero'],
      dateMiseEnCharge: cycle['dateMiseEnCharge'],
      dateCloture: cycle['dateCloture'] ?? null,
      statut: cycle['statut'],
      especeId: cycle['especeId'] ?? null,
    },
    infrastructure: {
      id: infra.id,
      nom: infra['nom'],
      mesureBase: type['mesureBase'],
      forme: type['forme'],
      longueur: nb(infra['longueur']),
      largeur: nb(infra['largeur']),
      diametre: nb(infra['diametre']),
      profondeur: nb(infra['profondeur']),
      niveauRemplissage: nb(infra['niveauRemplissage']) ?? 100,
      superficie: nb(infra['superficie']),
      volume: nb(infra['volume']),
    },
    lots: lots.map((l) => ({
      id: l.id,
      especeId: l['especeId'],
      nombre: Number(l['nombre']),
      poidsMoyenG: Number(l['poidsMoyenG']),
      coutUnitaire: Number(l['coutUnitaire'] ?? 0),
      dateMiseEnCharge: l['dateMiseEnCharge'],
    })),
    mortalites: mortalites.map((m) => ({
      id: m.id,
      lotId: m['lotId'],
      dateConstat: m['dateConstat'],
      nombre: Number(m['nombre']),
      remplacement: Number(m['remplacement'] ?? 0),
      coutUnitaire: nb(m['coutUnitaire']),
    })),
    pesees: parDate(pesees, 'dateOperation').map((p) => ({
      id: p.id,
      numero: p['numero'],
      dateOperation: p['dateOperation'],
      tauxRationPct: nb(p['tauxRationPct']),
    })),
    echantillons: echantillons.map((e) => ({
      id: e.id,
      peseeId: e['peseeId'],
      lotId: e['lotId'] ?? null,
      numero: e['numero'],
      nombre: Number(e['nombre']),
      poidsTotalG: Number(e['poidsTotalG']),
    })),
    distributions: distributions.map((d) => ({
      id: d.id,
      peseeId: d['peseeId'] ?? null,
      alimentId: d['alimentId'],
      dateDebut: d['dateDebut'],
      quantiteTotaleKg: Number(d['quantiteTotaleKg']),
      prixKgApplique: nb(d['prixKgApplique']),
    })),
    traitements: traitements.map((t) => ({
      id: t.id,
      produitSanitaireId: t['produitSanitaireId'] ?? null,
      dateOperation: t['dateOperation'],
      quantite: nb(t['quantite']),
      prixUnitaire: nb(t['prixUnitaire']),
      finDelaiAttente: t['finDelaiAttente'] ?? null,
    })),
    recoltes: recoltes.map((r) => ({
      id: r.id,
      lotId: r['lotId'] ?? null,
      especeId: r['especeId'] ?? null,
      dateOperation: r['dateOperation'],
      type: r['type'],
      poidsKg: Number(r['poidsKg']),
      nombre: nb(r['nombre']),
      prixKg: Number(r['prixKg'] ?? 0),
    })),
    depenses: depenses.map((d) => ({
      id: d.id,
      categorie: d['categorie'],
      montant: Number(d['montant']),
      dateOperation: d['dateOperation'],
    })),
    especes: especes.map((e) => ({
      id: e.id,
      nom: e['nom'],
      codeFao: e['codeFao'] ?? null,
      gainJournalierRef: nb(e['gainJournalierRef']),
      indiceConsommationRef: nb(e['indiceConsommationRef']),
      tauxSurvieRef: nb(e['tauxSurvieRef']),
      temperatureOptMin: nb(e['temperatureOptMin']),
      temperatureOptMax: nb(e['temperatureOptMax']),
      temperatureMin: nb(e['temperatureMin']),
      temperatureMax: nb(e['temperatureMax']),
      oxygeneMin: nb(e['oxygeneMin']),
      densiteMaxM2: nb(e['densiteMaxM2']),
      densiteMaxM3: nb(e['densiteMaxM3']),
      seuilHeterogeneitePct: nb(e['seuilHeterogeneitePct']),
    })),
  };
}

export interface EtatCycle {
  indicateurs: Indicateurs;
  ration: ReturnType<typeof rationConseillee>;
  alertes: Alerte[];
}

/// Indicateurs et ration conseillée du jour : palier de l'espèce du lot le
/// plus lourd, à son poids moyen, appliqué à la biomasse totale du bassin, et
/// corrigé par la dernière température relevée. En polyculture, c'est une
/// approximation : un seul aliment est distribué pour tout le bassin.
export async function etatCycle(cycleId: string): Promise<EtatCycle | null> {
  const complet = await cycleComplet(cycleId);
  if (!complet || complet.lots.length === 0) return null;
  const indicateurs = calculerIndicateurs(complet);
  const releves = await db.mesures.where('cycleId').equals(cycleId).toArray();
  // Même moteur que l'API (étape 8) : l'alerte d'oxygène s'affiche au bord
  // du bassin, sans attendre le réseau.
  const alertes = calculerAlertes(
    complet,
    {
      aujourdhui: aujourdhui(),
      mesures: releves.map((m) => ({
        dateMesure: m['dateMesure'],
        heure: m['heure'] ?? null,
        temperature: nb(m['temperature']),
        oxygeneDissous: nb(m['oxygeneDissous']),
        ph: nb(m['ph']),
      })),
    },
    indicateurs,
  );

  const principal = [...indicateurs.lots].sort((a, b) => b.biomasseKg - a.biomasseKg)[0];
  let ration: EtatCycle['ration'] = null;
  if (principal && principal.effectif > 0) {
    const paliers = await db.paliers.where('especeId').equals(principal.lot.especeId).toArray();
    const mesures = await db.mesures.where('cycleId').equals(cycleId).toArray();
    const derniere = parDate(mesures.filter((m) => m['temperature'] != null), 'dateMesure').at(-1);
    ration = rationConseillee(
      paliers.map((p) => ({
        id: p.id,
        especeId: p['especeId'],
        poidsMin: Number(p['poidsMin']),
        poidsMax: Number(p['poidsMax']),
        temperatureMin: nb(p['temperatureMin']),
        temperatureMax: nb(p['temperatureMax']),
        tauxPct: Number(p['tauxPct']),
        frequenceRepas: Number(p['frequenceRepas']),
        source: p['source'] ?? null,
      })),
      principal.lot.especeId,
      principal.poidsMoyenG,
      indicateurs.lots.reduce((s, l) => s + l.biomasseKg, 0),
      nb(derniere?.['temperature']),
    );
  }
  return { indicateurs, ration, alertes };
}
