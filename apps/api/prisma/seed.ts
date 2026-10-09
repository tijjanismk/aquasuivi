import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import type { Prisma } from '@prisma/client';
import { hacher } from '../src/auth/mot-de-passe.js';

// The .env file lives at the monorepo root, not next to this script.
try {
  process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env'));
} catch {
  // pas de .env (conteneur) : variables d'environnement du système
}

// Initialize database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create Prisma adapter with the pool
const adapter = new PrismaPg(pool);

// Initialize Prisma client with adapter
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    console.log('Seeding database...');

    // === REFERENCE DATA: Species ===
    const especes = await prisma.espece.createMany({
      data: [
        {
          nom: 'Tilapia du Nil',
          codeFao: 'TLN',
          temperatureOptMin: 26,
          temperatureOptMax: 32,
          oxygeneMin: 3,
          gainJournalierRef: 2.1,
          indiceConsommationRef: 1.6,
          tauxSurvieRef: 0.9,
          poidsMarcheMin: 180,
          poidsMarcheMax: 500,
          dureeCycleRef: 180,
          densiteMaxM2: 25,
          densiteMaxM3: 500,
        },
        {
          nom: 'Clarias gariepinus (poisson-chat)',
          codeFao: null,
          temperatureOptMin: 24,
          temperatureOptMax: 28,
          oxygeneMin: 2,
          gainJournalierRef: 2.5,
          indiceConsommationRef: 1.8,
          tauxSurvieRef: 0.88,
          poidsMarcheMin: 200,
          poidsMarcheMax: 600,
          dureeCycleRef: 150,
          densiteMaxM2: 15,
          densiteMaxM3: 350,
        },
        {
          nom: 'Carpe commune',
          codeFao: null,
          temperatureOptMin: 20,
          temperatureOptMax: 28,
          oxygeneMin: 4,
          gainJournalierRef: 1.8,
          indiceConsommationRef: 2.2,
          tauxSurvieRef: 0.92,
          poidsMarcheMin: 250,
          poidsMarcheMax: 800,
          dureeCycleRef: 200,
          densiteMaxM2: 10,
          densiteMaxM3: 250,
        },
        {
          nom: 'Carpe herbivore',
          codeFao: null,
          temperatureOptMin: 22,
          temperatureOptMax: 30,
          oxygeneMin: 3,
          gainJournalierRef: 2.3,
          indiceConsommationRef: 1.4,
          tauxSurvieRef: 0.91,
          poidsMarcheMin: 200,
          poidsMarcheMax: 700,
          dureeCycleRef: 160,
          densiteMaxM2: 12,
          densiteMaxM3: 300,
        },
        {
          nom: 'Mâchoiron',
          codeFao: null,
          temperatureOptMin: 18,
          temperatureOptMax: 28,
          oxygeneMin: 5,
          gainJournalierRef: 1.5,
          indiceConsommationRef: 2.5,
          tauxSurvieRef: 0.90,
          poidsMarcheMin: 300,
          poidsMarcheMax: 1000,
          dureeCycleRef: 240,
          densiteMaxM2: 8,
          densiteMaxM3: 200,
        },
        {
          nom: 'Silure du Nil',
          codeFao: null,
          temperatureOptMin: 23,
          temperatureOptMax: 29,
          oxygeneMin: 2.5,
          gainJournalierRef: 3.0,
          indiceConsommationRef: 1.7,
          tauxSurvieRef: 0.85,
          poidsMarcheMin: 150,
          poidsMarcheMax: 500,
          dureeCycleRef: 140,
          densiteMaxM2: 20,
          densiteMaxM3: 450,
        },
        {
          nom: 'Trout',
          codeFao: null,
          temperatureOptMin: 12,
          temperatureOptMax: 18,
          oxygeneMin: 7,
          gainJournalierRef: 1.8,
          indiceConsommationRef: 1.5,
          tauxSurvieRef: 0.88,
          poidsMarcheMin: 200,
          poidsMarcheMax: 400,
          dureeCycleRef: 200,
          densiteMaxM2: 30,
          densiteMaxM3: 600,
        },
        {
          nom: 'Perche du Nil',
          codeFao: null,
          temperatureOptMin: 25,
          temperatureOptMax: 31,
          oxygeneMin: 3.5,
          gainJournalierRef: 2.2,
          indiceConsommationRef: 1.9,
          tauxSurvieRef: 0.87,
          poidsMarcheMin: 300,
          poidsMarcheMax: 900,
          dureeCycleRef: 210,
          densiteMaxM2: 5,
          densiteMaxM3: 150,
        },
      ],
      skipDuplicates: true,
    });
    console.log(`Created ${especes.count} species`);

    // === REFERENCE DATA: Infrastructure Types ===
    const typeInfrastructures = await prisma.typeInfrastructure.createMany({
      data: [
        {
          code: 'BASSIN_CIMENT',
          nom: 'Bassin en ciment',
          forme: 'RECTANGULAIRE',
          mesureBase: 'VOLUME',
          milieuFao: 'FRESHWATER',
          systemeFao: 'PONDS_TANKS',
          horsSol: false,
          aerable: true,
        },
        {
          code: 'ETANG_TERRE',
          nom: 'Etang en terre',
          forme: 'IRREGULIERE',
          mesureBase: 'SUPERFICIE',
          milieuFao: 'FRESHWATER',
          systemeFao: 'PONDS_TANKS',
          horsSol: false,
          aerable: false,
        },
        {
          code: 'BAC_HORS_SOL',
          nom: 'Bac hors-sol',
          forme: 'RECTANGULAIRE',
          mesureBase: 'VOLUME',
          milieuFao: 'FRESHWATER',
          systemeFao: 'PONDS_TANKS',
          horsSol: true,
          aerable: true,
        },
        {
          code: 'BAC_CIRCULAIRE',
          nom: 'Bac circulaire',
          forme: 'CIRCULAIRE',
          mesureBase: 'VOLUME',
          milieuFao: 'FRESHWATER',
          systemeFao: 'PONDS_TANKS',
          horsSol: true,
          aerable: true,
        },
        {
          code: 'CAGE_RECT',
          nom: 'Cage rectangulaire',
          forme: 'RECTANGULAIRE',
          mesureBase: 'VOLUME',
          milieuFao: 'FRESHWATER',
          systemeFao: 'CAGES',
          horsSol: false,
          aerable: true,
        },
        {
          code: 'CAGE_CIRC',
          nom: 'Cage circulaire',
          forme: 'CIRCULAIRE',
          mesureBase: 'VOLUME',
          milieuFao: 'FRESHWATER',
          systemeFao: 'CAGES',
          horsSol: false,
          aerable: true,
        },
        {
          code: 'RACEWAY',
          nom: 'Raceway',
          forme: 'RECTANGULAIRE',
          mesureBase: 'VOLUME',
          milieuFao: 'FRESHWATER',
          systemeFao: 'RACEWAYS_SILOS',
          horsSol: true,
          aerable: true,
        },
        {
          code: 'RAS',
          nom: 'RAS (Recirculating Aquaculture System)',
          forme: 'IRREGULIERE',
          mesureBase: 'VOLUME',
          milieuFao: 'FRESHWATER',
          systemeFao: 'PONDS_TANKS',
          horsSol: true,
          aerable: true,
        },
        {
          code: 'ENCLOS_RIVIERE',
          nom: 'Enclos en rivière',
          forme: 'RECTANGULAIRE',
          mesureBase: 'VOLUME',
          milieuFao: 'FRESHWATER',
          systemeFao: 'PENS_ENCLOSURES',
          horsSol: false,
          aerable: true,
        },
        {
          code: 'RIZIPISCICULTURE',
          nom: 'Rizipisciculture',
          forme: 'RECTANGULAIRE',
          mesureBase: 'SUPERFICIE',
          milieuFao: 'FRESHWATER',
          systemeFao: 'RICE_FISH',
          horsSol: false,
          aerable: false,
        },
        {
          code: 'ECLOSERIE',
          nom: 'Écloserie/bac de nurserie',
          forme: 'RECTANGULAIRE',
          mesureBase: 'VOLUME',
          milieuFao: 'FRESHWATER',
          systemeFao: 'HATCHERIES_NURSERIES',
          horsSol: true,
          aerable: true,
        },
        {
          code: 'BARRAGE',
          nom: 'Retenue/barrage',
          forme: 'IRREGULIERE',
          mesureBase: 'SUPERFICIE',
          milieuFao: 'FRESHWATER',
          systemeFao: 'BARRAGES',
          horsSol: false,
          aerable: false,
        },
      ],
      skipDuplicates: true,
    });
    console.log(`Created ${typeInfrastructures.count} infrastructure types`);

    // === REFERENCE DATA: Aliments ===
    const aliments = await prisma.aliment.createMany({
      data: [
        {
          nom: 'Sabalagnon local',
          granulometrieMm: 1.8,
          tauxProteine: 28,
          prixKg: 250,
          poidsPoissonMin: 0,
          poidsPoissonMax: 100,
          local: true,
        },
        {
          nom: 'Skretting 1.2mm',
          granulometrieMm: 1.2,
          tauxProteine: 45,
          prixKg: 800,
          poidsPoissonMin: 5,
          poidsPoissonMax: 50,
          local: false,
        },
        {
          nom: 'Skretting 1.8mm',
          granulometrieMm: 1.8,
          tauxProteine: 45,
          prixKg: 850,
          poidsPoissonMin: 30,
          poidsPoissonMax: 150,
          local: false,
        },
        {
          nom: 'Skretting 2mm',
          granulometrieMm: 2.0,
          tauxProteine: 42,
          prixKg: 900,
          poidsPoissonMin: 100,
          poidsPoissonMax: 300,
          local: false,
        },
        {
          nom: 'Skretting 3mm',
          granulometrieMm: 3.0,
          tauxProteine: 40,
          prixKg: 950,
          poidsPoissonMin: 200,
          poidsPoissonMax: 500,
          local: false,
        },
        {
          nom: 'Skretting 4mm',
          granulometrieMm: 4.0,
          tauxProteine: 38,
          prixKg: 1000,
          poidsPoissonMin: 350,
          poidsPoissonMax: 1000,
          local: false,
        },
        {
          nom: 'Son de riz',
          granulometrieMm: 2.5,
          tauxProteine: 12,
          prixKg: 150,
          poidsPoissonMin: 50,
          poidsPoissonMax: 500,
          local: true,
        },
        {
          nom: 'Tourteau de coton',
          granulometrieMm: 2.0,
          tauxProteine: 38,
          prixKg: 200,
          poidsPoissonMin: 50,
          poidsPoissonMax: 500,
          local: true,
        },
      ],
      skipDuplicates: true,
    });
    console.log(`Created ${aliments.count} food types`);

    // === REFERENCE DATA: Produits Sanitaires ===
    const produitsSanitaires = await prisma.produitSanitaire.createMany({
      data: [
        {
          nom: 'Oxyfuran',
          delaiAttenteJours: 30,
          indication: 'Antibactérien',
        },
        {
          nom: 'Chlorure de sodium (NaCl)',
          delaiAttenteJours: 0,
          indication: 'Bain d\'eau salée, antiparasitaire',
        },
        {
          nom: 'Chaux vive',
          delaiAttenteJours: 0,
          indication: 'Désinfectant de bassin',
        },
        {
          nom: 'Permanganate de potassium',
          delaiAttenteJours: 3,
          indication: 'Antiparasitaire',
        },
        {
          nom: 'Vitamine C (acide ascorbique)',
          delaiAttenteJours: 0,
          indication: 'Immunostimulant',
        },
      ],
      skipDuplicates: true,
    });
    console.log(`Created ${produitsSanitaires.count} sanitaire products`);

    // === REFERENCE DATA: Paliers de Rationnement (FAO Tables) ===
    const paliers = await prisma.palierRationnement.createMany({
      data: [
        // Tilapia du Nil - Palier 1 (alevins 0-10g)
        {
          especeId: (await prisma.espece.findFirst({ where: { codeFao: 'TLN' } }))?.id || '',
          poidsMin: 0,
          poidsMax: 10,
          tauxPct: 10,
          frequenceRepas: 4,
          temperatureMin: 26,
          temperatureMax: 32,
          source: 'Alevins, 4x/jour',
        },
        // Tilapia - Palier 2 (10-25g)
        {
          especeId: (await prisma.espece.findFirst({ where: { codeFao: 'TLN' } }))?.id || '',
          poidsMin: 10,
          poidsMax: 25,
          tauxPct: 8,
          frequenceRepas: 3,
          temperatureMin: 26,
          temperatureMax: 32,
          source: 'Post-alevins, 3x/jour',
        },
        // Tilapia - Palier 3 (25-50g)
        {
          especeId: (await prisma.espece.findFirst({ where: { codeFao: 'TLN' } }))?.id || '',
          poidsMin: 25,
          poidsMax: 50,
          tauxPct: 6,
          frequenceRepas: 2,
          temperatureMin: 26,
          temperatureMax: 32,
          source: 'Jeunes, 2x/jour',
        },
        // Tilapia - Palier 4 (50-150g)
        {
          especeId: (await prisma.espece.findFirst({ where: { codeFao: 'TLN' } }))?.id || '',
          poidsMin: 50,
          poidsMax: 150,
          tauxPct: 4,
          frequenceRepas: 2,
          temperatureMin: 26,
          temperatureMax: 32,
          source: 'Pré-marché, 2x/jour',
        },
        // Tilapia - Palier 5 (150-350g)
        {
          especeId: (await prisma.espece.findFirst({ where: { codeFao: 'TLN' } }))?.id || '',
          poidsMin: 150,
          poidsMax: 350,
          tauxPct: 3,
          frequenceRepas: 1,
          temperatureMin: 26,
          temperatureMax: 32,
          source: 'Marché, 1x/jour',
        },
        // Tilapia - Palier 6 (>350g)
        {
          especeId: (await prisma.espece.findFirst({ where: { codeFao: 'TLN' } }))?.id || '',
          poidsMin: 350,
          poidsMax: 2000,
          tauxPct: 2,
          frequenceRepas: 1,
          temperatureMin: 26,
          temperatureMax: 32,
          source: 'Gros, 1x/jour',
        },
        // Tilapia - Temperature reduction <26°C
        {
          especeId: (await prisma.espece.findFirst({ where: { codeFao: 'TLN' } }))?.id || '',
          poidsMin: 0,
          poidsMax: 2000,
          tauxPct: 0,
          frequenceRepas: 0,
          temperatureMin: 0,
          temperatureMax: 20,
          source: 'Arrêt alimentation <20°C',
        },
        // Clarias - Palier 1 (0-15g)
        {
          especeId: (await prisma.espece.findFirst({ where: { nom: 'Clarias gariepinus (poisson-chat)' } }))?.id || '',
          poidsMin: 0,
          poidsMax: 15,
          tauxPct: 12,
          frequenceRepas: 3,
          temperatureMin: 24,
          temperatureMax: 28,
          source: 'Alevins Clarias',
        },
        // Clarias - Palier 2 (15-40g)
        {
          especeId: (await prisma.espece.findFirst({ where: { nom: 'Clarias gariepinus (poisson-chat)' } }))?.id || '',
          poidsMin: 15,
          poidsMax: 40,
          tauxPct: 8,
          frequenceRepas: 2,
          temperatureMin: 24,
          temperatureMax: 28,
          source: 'Post-alevins Clarias',
        },
        // Clarias - Palier 3 (40-100g)
        {
          especeId: (await prisma.espece.findFirst({ where: { nom: 'Clarias gariepinus (poisson-chat)' } }))?.id || '',
          poidsMin: 40,
          poidsMax: 100,
          tauxPct: 6,
          frequenceRepas: 2,
          temperatureMin: 24,
          temperatureMax: 28,
          source: 'Jeunes Clarias',
        },
        // Clarias - Palier 4 (100-250g)
        {
          especeId: (await prisma.espece.findFirst({ where: { nom: 'Clarias gariepinus (poisson-chat)' } }))?.id || '',
          poidsMin: 100,
          poidsMax: 250,
          tauxPct: 4,
          frequenceRepas: 1,
          temperatureMin: 24,
          temperatureMax: 28,
          source: 'Marché Clarias',
        },
        // Clarias - Palier 5 (>250g)
        {
          especeId: (await prisma.espece.findFirst({ where: { nom: 'Clarias gariepinus (poisson-chat)' } }))?.id || '',
          poidsMin: 250,
          poidsMax: 2000,
          tauxPct: 2,
          frequenceRepas: 1,
          temperatureMin: 24,
          temperatureMax: 28,
          source: 'Gros Clarias',
        },
      ],
      skipDuplicates: true,
    });
    console.log(`Created ${paliers.count} rationing tiers`);

    await geographie();

    await administrateur();

    console.log('✅ Seeding complete!');
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

interface Decoupage {
  code: string;
  name: string;
  /// Absent : une région.
  type?: 'REGION' | 'DISTRICT';
  cercles: { code: string; name: string; communes: { code: string; name: string }[] }[];
}

/// Découpage administratif du Mali : 19 régions, 157 cercles, 792 communes,
/// plus le district de Bamako (`bamako.json`, absent du fichier source ;
/// codes « 00… » attribués ici, pas officiels). Le district n'a pas de
/// cercle : son cercle « Bamako » est technique.
/// Rejouable : chaque ligne est retrouvée par son code, sinon par son nom
/// (lignes saisies avant le chargement, qui reçoivent alors leur code), et
/// son nom est remis à celui du fichier. Une ligne absente du fichier n'est
/// retirée que si aucune ferme n'y pointe.
/// Les villages du fichier ne sont pas chargés : `Ferme.village` reste un texte.
async function geographie() {
  const lire = (nom: string) =>
    JSON.parse(readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'data', nom), 'utf8')) as Decoupage[];
  const decoupage = [...lire('bamako.json'), ...lire('decoupage_mali.json')];
  let cercles = 0;
  let communes = 0;
  for (const r of decoupage) {
    // « Région de Sikasso » → « Sikasso », le nom déjà en base et dans les comptes.
    // Un district garde son nom entier : « District de Bamako » n'est pas une région.
    const type = r.type ?? 'REGION';
    const nomRegion = type === 'REGION' ? r.name.replace(/^Région de /, '') : r.name;
    const regionExistante =
      (await prisma.region.findUnique({ where: { code: r.code } })) ??
      (await prisma.region.findUnique({ where: { nom: nomRegion } }));
    const region = regionExistante
      ? await prisma.region.update({ where: { id: regionExistante.id }, data: { code: r.code, nom: nomRegion, type } })
      : await prisma.region.create({ data: { code: r.code, nom: nomRegion, type } });

    for (const c of r.cercles) {
      const cercleExistant =
        (await prisma.cercle.findUnique({ where: { code: c.code } })) ??
        (await prisma.cercle.findUnique({ where: { regionId_nom: { regionId: region.id, nom: c.name } } }));
      const cercle = cercleExistant
        ? await prisma.cercle.update({ where: { id: cercleExistant.id }, data: { code: c.code, nom: c.name, regionId: region.id } })
        : await prisma.cercle.create({ data: { code: c.code, nom: c.name, regionId: region.id } });
      cercles++;

      for (const m of c.communes) {
        const communeExistante =
          (await prisma.commune.findUnique({ where: { code: m.code } })) ??
          (await prisma.commune.findUnique({ where: { cercleId_nom: { cercleId: cercle.id, nom: m.name } } }));
        if (communeExistante) {
          await prisma.commune.update({ where: { id: communeExistante.id }, data: { code: m.code, nom: m.name, cercleId: cercle.id } });
        } else {
          await prisma.commune.create({ data: { code: m.code, nom: m.name, cercleId: cercle.id } });
        }
        communes++;
      }
    }
  }
  // Lignes de l'ancien seed (Kotouba, Siby… sous Sikasso) : absentes du
  // découpage, donc sans code. Retirées si aucune ferme n'y pointe.
  const communesRetirees = await prisma.commune.deleteMany({ where: { code: null, fermes: { none: {} } } });
  const cerclesRetires = await prisma.cercle.deleteMany({ where: { code: null, fermes: { none: {} }, communes: { none: {} } } });
  console.log(`Géographie : ${decoupage.length} régions et districts, ${cercles} cercles, ${communes} communes`
    + ` (${cerclesRetires.count} cercles et ${communesRetirees.count} communes hors découpage retirés)`);
}

/// Premier compte ADMIN. L'inscription libre ne donne que PISCICULTEUR (D19) :
/// sans ce compte, personne ne pourrait administrer les référentiels.
/// Rejouable : le mot de passe est remis à la valeur du .env.
async function administrateur() {
  const telephone = process.env['AQUA_ADMIN_TELEPHONE'];
  const motDePasse = process.env['AQUA_ADMIN_MOT_DE_PASSE'];
  if (!telephone || !motDePasse) {
    console.log('Aucun administrateur : AQUA_ADMIN_TELEPHONE / AQUA_ADMIN_MOT_DE_PASSE absents.');
    return;
  }
  const empreinte = await hacher(motDePasse);
  await prisma.user.upsert({
    where: { telephone },
    update: { role: 'ADMIN', actif: true, motDePasse: empreinte },
    create: { telephone, nom: 'Administrateur', role: 'ADMIN', motDePasse: empreinte },
  });
  console.log(`Administrateur : ${telephone}`);
}

main();