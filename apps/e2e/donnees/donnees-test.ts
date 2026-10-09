/// Données de démonstration : fermes réparties sur le territoire (Bamako
/// compris), bassins, cycles bouclés et en cours avec pesées, aliment,
/// mortalités, eau, traitements, récoltes et dépenses, plus quelques comptes.
///
/// Tout passe **par l'API** : contrôles de saisie, géométrie et délais
/// d'attente sont ceux de la production. Rejouable : les données d'un passage
/// précédent (préfixe « [TEST] », téléphones 7999…) sont d'abord effacées.
///
///   pnpm db:donnees-test                 # API sur http://localhost:3000/api
///   E2E_API_URL=http://localhost:3100/api pnpm db:donnees-test
///   pnpm db:donnees-test --effacer       # efface seulement
///
/// Jamais en production : ces fermes fausseraient toute consolidation.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { authentifierEnAdmin } from '../test/session.js';

process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env'));

const API = process.env['E2E_API_URL'] ?? 'http://localhost:3000/api';
const PREFIXE = '[TEST]';
const TELEPHONES = '7999%';
const MOT_DE_PASSE = 'test-aqua-2026';
/// Les dates de terrain ne peuvent pas être futures : tout se cale sur ce jour.
const AUJOURDHUI = new Date(new Date().toISOString().slice(0, 10));

type Ligne = Record<string, unknown> & { id: string };

async function appel<T = Ligne>(methode: string, chemin: string, corps?: unknown): Promise<T> {
  const r = await fetch(`${API}${chemin}`, {
    method: methode,
    ...(corps === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }),
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`${methode} ${chemin} → ${r.status} ${texte}\n${JSON.stringify(corps)}`);
  return (texte ? JSON.parse(texte) : undefined) as T;
}
const creer = (ressource: string, corps: Record<string, unknown>) => appel('POST', `/saisie/${ressource}`, corps);
const lister = (chemin: string) => appel<Ligne[]>('GET', `${chemin}${chemin.includes('?') ? '&' : '?'}_end=1000`);

/// Aléa reproductible : deux passages donnent les mêmes chiffres.
let graine = 20260926;
function alea() {
  graine = (graine * 1103515245 + 12345) % 2147483648;
  return graine / 2147483648;
}
const entre = (min: number, max: number) => min + (max - min) * alea();
const arrondi = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

const jour = (d: Date) => d.toISOString().slice(0, 10);
const plus = (d: Date, jours: number) => new Date(d.getTime() + jours * 86_400_000);
const ilYa = (jours: number) => plus(AUJOURDHUI, -jours);

async function effacer() {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  try {
    // Cascade : Ferme → Infrastructure → Cycle → lots, pesées, récoltes… et accès.
    const f = await pool.query('DELETE FROM "Ferme" WHERE nom LIKE $1', [`${PREFIXE}%`]);
    await pool.query('DELETE FROM "JetonRafraichissement" WHERE "userId" IN (SELECT id FROM "User" WHERE telephone LIKE $1)', [TELEPHONES]);
    await pool.query('DELETE FROM "Appareil" WHERE "userId" IN (SELECT id FROM "User" WHERE telephone LIKE $1)', [TELEPHONES]);
    const u = await pool.query('DELETE FROM "User" WHERE telephone LIKE $1', [TELEPHONES]);
    console.log(`Effacé : ${f.rowCount} fermes, ${u.rowCount} comptes de test.`);
  } finally {
    await pool.end();
  }
}

// --- Référentiels et géographie -------------------------------------------

interface Refs {
  tilapia: string;
  clarias: string;
  types: Map<string, string>;
  aliments: Map<string, string>;
  produits: Map<string, string>;
}

async function referentiels(): Promise<Refs> {
  const especes = await lister('/referentiels/especes');
  const trouver = (lignes: Ligne[], critere: (l: Ligne) => boolean, quoi: string) => {
    const l = lignes.find(critere);
    if (!l) throw new Error(`Référentiel absent : ${quoi}. Lancer « pnpm db:seed ».`);
    return l.id;
  };
  return {
    tilapia: trouver(especes, (e) => e['codeFao'] === 'TLN', 'tilapia'),
    clarias: trouver(especes, (e) => String(e['nom']).startsWith('Clarias'), 'clarias'),
    types: new Map((await lister('/referentiels/types-infrastructure')).map((t) => [String(t['code']), t.id])),
    aliments: new Map((await lister('/referentiels/aliments')).map((a) => [String(a['nom']), a.id])),
    produits: new Map((await lister('/referentiels/produits-sanitaires')).map((p) => [String(p['nom']), p.id])),
  };
}

/// Région (ou district) → cercle → commune, par leurs noms dans le découpage.
async function territoire(region: string, cercle: string, commune: string) {
  const r = (await appel<Ligne[]>('GET', '/geographie/regions')).find((l) => l['nom'] === region);
  if (!r) throw new Error(`Région inconnue : ${region}`);
  const c = (await appel<Ligne[]>('GET', `/geographie/cercles?regionId=${r.id}`)).find((l) => l['nom'] === cercle);
  if (!c) throw new Error(`Cercle inconnu : ${region} / ${cercle}`);
  const m = (await appel<Ligne[]>('GET', `/geographie/communes?cercleId=${c.id}`)).find((l) => l['nom'] === commune);
  if (!m) throw new Error(`Commune inconnue : ${cercle} / ${commune}`);
  return { regionId: r.id, cercleId: c.id, communeId: m.id };
}

// --- Un cycle complet -----------------------------------------------------

interface PlanCycle {
  numero: number;
  espece: 'tilapia' | 'clarias';
  debut: Date;
  /// Absente : cycle en cours, suivi jusqu'à aujourd'hui.
  fin?: Date;
  alevins: number;
  poidsInitialG: number;
  /// Croissance moyenne, g/jour.
  gainG: number;
  /// Mortalité totale visée, en fraction de l'effectif.
  pertes: number;
  prixAlevin: number;
  prixKg: number;
  /// Oxygène bas sur les dernières mesures : de quoi déclencher une alerte.
  oxygeneBas?: boolean;
  /// Mortalité brutale récente, pour l'alerte correspondante.
  crise?: boolean;
}

async function cycle(infraId: string, p: PlanCycle, refs: Refs) {
  const especeId = p.espece === 'tilapia' ? refs.tilapia : refs.clarias;
  const fin = p.fin ?? ilYa(2);
  const c = await creer('cycles', {
    infrastructureId: infraId,
    numero: p.numero,
    dateMiseEnCharge: jour(p.debut),
    especeId,
  });
  const lot = await creer('lots', {
    cycleId: c.id,
    especeId,
    nombre: p.alevins,
    poidsMoyenG: p.poidsInitialG,
    coutUnitaire: p.prixAlevin,
    dateMiseEnCharge: jour(p.debut),
    origine: 'ECLOSERIE',
  });

  const duree = Math.round((fin.getTime() - p.debut.getTime()) / 86_400_000);
  const poids = (j: number) => p.poidsInitialG + p.gainG * j;

  // Mortalités : quelques constats étalés, plus une crise récente si demandé.
  let morts = 0;
  const constats = Math.max(2, Math.floor(duree / 45));
  for (let i = 1; i <= constats; i++) {
    const n = Math.round((p.alevins * p.pertes) / constats * entre(0.6, 1.4));
    const d = plus(p.debut, Math.round((duree * i) / (constats + 1)));
    await creer('mortalites', { lotId: lot.id, dateConstat: jour(d), nombre: n, remplacement: 0, cause: i === 1 ? 'Stress de transport' : 'Non déterminée' });
    morts += n;
  }
  if (p.crise) {
    const n = Math.round(p.alevins * 0.15);
    await creer('mortalites', { lotId: lot.id, dateConstat: jour(ilYa(3)), nombre: n, remplacement: 0, cause: 'Mortalité massive — oxygène ?' });
    morts += n;
  }
  const vivants = (j: number) => p.alevins - Math.round(morts * Math.min(1, j / duree));

  // Pesées mensuelles, trois échantillons chacune.
  let numero = 0;
  for (let j = 30; j <= duree; j += 30) {
    const d = plus(p.debut, j);
    const pesee = await creer('pesees', {
      cycleId: c.id,
      numero: ++numero,
      dateOperation: jour(d),
      tauxRationPct: poids(j) < 50 ? 3.5 : poids(j) < 150 ? 2.2 : 1.4,
    });
    for (let e = 1; e <= 3; e++) {
      const nombre = Math.round(entre(8, 12));
      await creer('echantillons', {
        peseeId: pesee.id,
        lotId: lot.id,
        numero: e,
        nombre,
        poidsTotalG: arrondi(nombre * poids(j) * entre(0.88, 1.12)),
      });
    }
  }

  // Aliment : une distribution par mois, à la ration du poids moyen du moment.
  const aliment = (g: number) =>
    g < 20 ? 'Skretting 1.2mm' : g < 60 ? 'Skretting 2mm' : g < 200 ? 'Skretting 3mm' : 'Skretting 4mm';
  for (let j = 0; j < duree; j += 30) {
    const g = poids(j + 15);
    // Ration raisonnée : un IC autour de 1,6–1,9, comme sur une ferme bien conduite.
    const taux = g < 50 ? 0.035 : g < 150 ? 0.022 : 0.014;
    const kg = arrondi((vivants(j + 15) * g * taux * Math.min(30, duree - j)) / 1000, 1);
    const nom = aliment(g);
    await creer('distributions', {
      cycleId: c.id,
      alimentId: refs.aliments.get(nom) ?? [...refs.aliments.values()][0],
      dateDebut: jour(plus(p.debut, j)),
      quantiteTotaleKg: kg,
      // Prix dégressifs : le gros granulé coûte moins cher au kilo.
      prixKgApplique: g < 20 ? 1150 : g < 60 ? 950 : g < 200 ? 750 : 600,
    });
  }

  // Qualité de l'eau : tous les quinze jours, oxygène relevé à l'aube.
  for (let j = 7; j <= duree; j += 15) {
    const recente = duree - j < 20;
    await creer('mesures-eau', {
      infrastructureId: infraId,
      cycleId: c.id,
      dateMesure: jour(plus(p.debut, j)),
      heure: '06:30',
      temperature: arrondi(entre(26, 30.5), 1),
      oxygeneDissous: p.oxygeneBas && recente ? arrondi(entre(1.4, 2.2), 1) : arrondi(entre(4, 6.5), 1),
      ph: arrondi(entre(6.8, 8.2), 1),
      transparenceSecchi: Math.round(entre(25, 45)),
    });
  }

  // Un traitement préventif au premier mois.
  const oxyfuran = refs.produits.get('Oxyfuran');
  if (oxyfuran && duree > 40) {
    await creer('traitements', { cycleId: c.id, produitSanitaireId: oxyfuran, dateOperation: jour(plus(p.debut, 20)), quantite: 1, prixUnitaire: 3500 });
  }

  // Dépenses courantes.
  for (const [categorie, montant] of [['EAU', 5000 + Math.round(duree * 30)], ['MAIN_OEUVRE', Math.round(duree / 30) * 10000], ['TRANSPORT', 12000]] as const) {
    await creer('depenses', { cycleId: c.id, categorie, montant, dateOperation: jour(p.fin ? plus(fin, -1) : ilYa(5)) });
  }

  // Cycle bouclé : récolte en trois fois, puis vidange.
  if (p.fin) {
    const totalKg = (vivants(duree) * poids(duree)) / 1000;
    const parts = [
      ['VENTE', 0.55, 12],
      ['VENTE', 0.35, 5],
      ['DON', 0.04, 1],
      ['AUTOCONSOMMATION', 0.06, 0],
    ] as const;
    for (const [type, part, avant] of parts) {
      await creer('recoltes', {
        cycleId: c.id,
        lotId: lot.id,
        especeId,
        dateOperation: jour(plus(fin, -avant)),
        type,
        poidsKg: arrondi(totalKg * part, 1),
        prixKg: type === 'VENTE' ? p.prixKg : 0,
      });
    }
    await appel('PATCH', `/saisie/cycles/${c.id}`, { dateCloture: jour(fin), statut: 'BOUCLE' });
  }
  return c.id;
}

// --- Le jeu de données ------------------------------------------------------

interface PlanFerme {
  nom: string;
  promoteur: string;
  telephone: string;
  village: string;
  lieu: [string, string, string];
  /// Latitude, longitude approximatives du village. Absente : la ferme
  /// apparaît dans « Fermes sans coordonnées » sur la carte.
  position?: [number, number];
  bassins: { nom: string; type: string; longueur?: number; largeur?: number; diametre?: number; profondeur?: number; cycles: PlanCycle[] }[];
}

const tilapia = (numero: number, debut: Date, fin: Date | undefined, surface: number, densite: number, extra: Partial<PlanCycle> = {}): PlanCycle => ({
  numero, espece: 'tilapia', debut, ...(fin ? { fin } : {}),
  alevins: Math.round(surface * densite), poidsInitialG: 5, gainG: entre(1.6, 2.3), pertes: entre(0.06, 0.15),
  prixAlevin: 100, prixKg: 2250, ...extra,
});
const clarias = (numero: number, debut: Date, fin: Date | undefined, volume: number, extra: Partial<PlanCycle> = {}): PlanCycle => ({
  numero, espece: 'clarias', debut, ...(fin ? { fin } : {}),
  alevins: Math.round(volume * 40), poidsInitialG: 10, gainG: entre(3, 4.5), pertes: entre(0.08, 0.2),
  prixAlevin: 150, prixKg: 2500, ...extra,
});

function fermes(): PlanFerme[] {
  return [
    {
      nom: `${PREFIXE} Ferme de Finkolo`, promoteur: 'Adama Traoré', telephone: '76 00 11 22', village: 'Finkolo', position: [11.27, -5.52],
      lieu: ['Sikasso', 'Sikasso', 'FINKOLO'],
      bassins: [
        { nom: 'B1', type: 'BASSIN_CIMENT', longueur: 10, largeur: 8, profondeur: 1.2, cycles: [tilapia(1, ilYa(420), ilYa(200), 80, 10), tilapia(2, ilYa(120), undefined, 80, 10)] },
        { nom: 'B2', type: 'BASSIN_CIMENT', longueur: 10, largeur: 8, profondeur: 1.2, cycles: [tilapia(1, ilYa(90), undefined, 80, 10, { oxygeneBas: true })] },
      ],
    },
    {
      nom: `${PREFIXE} Ferme du Fleuve`, promoteur: 'Coopérative Benkadi', telephone: '66 12 34 56', village: 'Ségou-Coura', position: [13.44, -6.25],
      lieu: ['Ségou', 'Ségou', 'BAGADADII'],
      bassins: [
        { nom: 'Étang 1', type: 'ETANG_TERRE', longueur: 30, largeur: 20, profondeur: 1.5, cycles: [tilapia(1, ilYa(365), ilYa(150), 600, 3), tilapia(2, ilYa(100), undefined, 600, 3)] },
      ],
    },
    {
      nom: `${PREFIXE} Pisciculture de Baguineda`, promoteur: 'Fatoumata Diarra', telephone: '79 45 67 89', village: 'Baguineda', position: [12.62, -7.78],
      lieu: ['Koulikoro', 'Kati', 'BAGUINEDA-CAMP'],
      bassins: [
        { nom: 'Cage C1', type: 'CAGE_RECT', longueur: 5, largeur: 5, profondeur: 3, cycles: [tilapia(1, ilYa(300), ilYa(90), 25, 100, { alevins: 2500 })] },
        { nom: 'Cage C2', type: 'CAGE_RECT', longueur: 5, largeur: 5, profondeur: 3, cycles: [tilapia(1, ilYa(75), undefined, 25, 100, { alevins: 2500 })] },
      ],
    },
    {
      nom: `${PREFIXE} Ferme hors-sol Commune V`, promoteur: 'Moussa Keïta', telephone: '70 98 76 54', village: 'Kalaban-Coura', position: [12.58, -8.02],
      lieu: ['District de Bamako', 'Bamako', 'COMMUNE V'],
      bassins: [
        { nom: 'Bac 1', type: 'BAC_CIRCULAIRE', diametre: 4, profondeur: 1.2, cycles: [clarias(1, ilYa(250), ilYa(80), 15)] },
        { nom: 'Bac 2', type: 'BAC_CIRCULAIRE', diametre: 4, profondeur: 1.2, cycles: [clarias(1, ilYa(60), undefined, 15, { crise: true })] },
      ],
    },
    {
      nom: `${PREFIXE} Ferme de Socoura`, promoteur: 'Hamadoun Cissé', telephone: '65 22 33 44', village: 'Socoura', position: [14.50, -4.13],
      lieu: ['Mopti', 'Mopti', 'SOCOURA'],
      bassins: [
        { nom: 'Étang A', type: 'ETANG_TERRE', longueur: 25, largeur: 15, profondeur: 1.3, cycles: [tilapia(1, ilYa(330), ilYa(110), 375, 3)] },
      ],
    },
    {
      nom: `${PREFIXE} Nouvelle ferme de Sero`, promoteur: 'Aminata Sidibé', telephone: '77 10 20 30', village: 'Sero',
      lieu: ['Kayes', 'Kayes', 'SERO'],
      bassins: [{ nom: 'B1', type: 'BASSIN_CIMENT', longueur: 6, largeur: 4, profondeur: 1, cycles: [] }],
    },
  ];
}

async function comptes(parNom: Map<string, Ligne>) {
  const sikasso = (await appel<Ligne[]>('GET', '/geographie/regions')).find((r) => r['nom'] === 'Sikasso')!;
  const faire = (corps: Record<string, unknown>) => appel('POST', '/admin/utilisateurs', { motDePasse: MOT_DE_PASSE, ...corps });
  const encadreur = await faire({ nom: 'Coulibaly', prenom: 'Seydou', telephone: '79990001', role: 'ENCADREUR' });
  await faire({ nom: 'Dembélé', prenom: 'Awa', telephone: '79990002', role: 'SECTEUR', regionId: sikasso.id });
  await faire({ nom: 'Sangaré', prenom: 'Ibrahim', telephone: '79990003', role: 'NATIONAL' });
  const pisciculteur = await faire({ nom: 'Traoré', prenom: 'Adama', telephone: '79990004', role: 'PISCICULTEUR' });

  const acces = (userId: string, ferme: string, niveau: string) =>
    appel('POST', '/admin/acces', { userId, fermeId: parNom.get(`${PREFIXE} ${ferme}`)!.id, niveau });
  await acces(encadreur.id, 'Ferme de Finkolo', 'ENCADREUR');
  await acces(encadreur.id, 'Ferme du Fleuve', 'ENCADREUR');
  await acces(pisciculteur.id, 'Ferme de Finkolo', 'PROPRIETAIRE');
}

// --- Exécution --------------------------------------------------------------

if (!(await fetch(`${API}/sante`).then((r) => r.ok).catch(() => false))) {
  console.error(`API injoignable sur ${API}. Lancez-la, ou passez E2E_API_URL.`);
  process.exit(1);
}

await effacer();
if (process.argv.includes('--effacer')) process.exit(0);

await authentifierEnAdmin(API);
const refs = await referentiels();
const creees = new Map<string, Ligne>();
let nCycles = 0;
for (const f of fermes()) {
  const ferme = await creer('fermes', {
    nom: f.nom, promoteur: f.promoteur, telephone: f.telephone, village: f.village, pays: 'Mali',
    ...(f.position ? { latitude: f.position[0], longitude: f.position[1] } : {}),
    ...(await territoire(...f.lieu)),
  });
  creees.set(f.nom, ferme);
  for (const b of f.bassins) {
    const { cycles, type, ...dimensions } = b;
    const infra = await creer('infrastructures', { ...dimensions, fermeId: ferme.id, typeInfrastructureId: refs.types.get(type), niveauRemplissage: 90 });
    for (const plan of cycles) {
      await cycle(infra.id, plan, refs);
      nCycles++;
    }
  }
  console.log(`  ${f.nom} — ${f.lieu.join(' / ')}`);
}
await comptes(creees);

console.log(`\n${creees.size} fermes, ${nCycles} cycles, 4 comptes créés sur ${API}.`);
console.log(`Comptes (mot de passe « ${MOT_DE_PASSE} ») : 79990001 encadreur · 79990002 secteur Sikasso · 79990003 national · 79990004 pisciculteur.`);
