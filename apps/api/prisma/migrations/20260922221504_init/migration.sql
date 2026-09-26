-- CreateEnum
CREATE TYPE "RoleUtilisateur" AS ENUM ('PISCICULTEUR', 'ENCADREUR', 'SECTEUR', 'REGION', 'NATIONAL', 'ADMIN');

-- CreateEnum
CREATE TYPE "NiveauAcces" AS ENUM ('PROPRIETAIRE', 'ENCADREUR', 'LECTURE');

-- CreateEnum
CREATE TYPE "FormeInfrastructure" AS ENUM ('RECTANGULAIRE', 'CIRCULAIRE', 'IRREGULIERE');

-- CreateEnum
CREATE TYPE "MesureBase" AS ENUM ('SUPERFICIE', 'VOLUME');

-- CreateEnum
CREATE TYPE "MilieuFao" AS ENUM ('FRESHWATER', 'BRACKISHWATER', 'MARICULTURE');

-- CreateEnum
CREATE TYPE "SystemeFao" AS ENUM ('PONDS_TANKS', 'CAGES', 'PENS_ENCLOSURES', 'RACEWAYS_SILOS', 'BARRAGES', 'RICE_FISH', 'RAFTS_ROPES_STAKES', 'HATCHERIES_NURSERIES');

-- CreateEnum
CREATE TYPE "StatutCycle" AS ENUM ('EN_COURS', 'EN_RECOLTE', 'BOUCLE');

-- CreateEnum
CREATE TYPE "TypeRecolte" AS ENUM ('VENTE', 'DON', 'AUTOCONSOMMATION');

-- CreateEnum
CREATE TYPE "OrigineLot" AS ENUM ('ECLOSERIE', 'CAPTURE', 'PRODUCTION_PROPRE');

-- CreateEnum
CREATE TYPE "CategorieDepense" AS ENUM ('EAU', 'MAIN_OEUVRE', 'AMORTISSEMENT', 'TRANSPORT', 'ENERGIE', 'AUTRE');

-- CreateTable
CREATE TABLE "Espece" (
    "id" TEXT NOT NULL,
    "codeFao" VARCHAR(3),
    "nom" TEXT NOT NULL,
    "nomScientifique" TEXT,
    "nomLocal" TEXT,
    "famille" TEXT,
    "temperatureMin" DECIMAL(4,1),
    "temperatureOptMin" DECIMAL(4,1),
    "temperatureOptMax" DECIMAL(4,1),
    "temperatureMax" DECIMAL(4,1),
    "oxygeneMin" DECIMAL(4,2),
    "gainJournalierRef" DECIMAL(6,2),
    "indiceConsommationRef" DECIMAL(5,2),
    "tauxSurvieRef" DECIMAL(5,2),
    "poidsMarcheMin" INTEGER,
    "poidsMarcheMax" INTEGER,
    "dureeCycleRef" INTEGER,
    "densiteMaxM2" DECIMAL(8,2),
    "densiteMaxM3" DECIMAL(8,2),
    "sourceParametres" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Espece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TypeInfrastructure" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "forme" "FormeInfrastructure" NOT NULL DEFAULT 'RECTANGULAIRE',
    "mesureBase" "MesureBase" NOT NULL DEFAULT 'SUPERFICIE',
    "milieuFao" "MilieuFao" NOT NULL DEFAULT 'FRESHWATER',
    "systemeFao" "SystemeFao" NOT NULL DEFAULT 'PONDS_TANKS',
    "horsSol" BOOLEAN NOT NULL DEFAULT false,
    "aerable" BOOLEAN NOT NULL DEFAULT false,
    "densiteMaxDefaut" DECIMAL(8,2),
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TypeInfrastructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aliment" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "marque" TEXT,
    "granulometrieMm" DECIMAL(5,2),
    "tauxProteine" DECIMAL(5,2),
    "prixKg" DECIMAL(10,2),
    "poidsPoissonMin" INTEGER,
    "poidsPoissonMax" INTEGER,
    "fournisseur" TEXT,
    "local" BOOLEAN NOT NULL DEFAULT false,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Aliment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProduitSanitaire" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "matiereActive" TEXT,
    "forme" TEXT,
    "unite" TEXT NOT NULL DEFAULT 'kg',
    "dosageRecommande" DECIMAL(10,3),
    "dosageUnite" TEXT,
    "prixUnitaire" DECIMAL(10,2),
    "delaiAttenteJours" INTEGER NOT NULL DEFAULT 0,
    "indication" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProduitSanitaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PalierRationnement" (
    "id" TEXT NOT NULL,
    "especeId" TEXT NOT NULL,
    "poidsMin" DECIMAL(8,2) NOT NULL,
    "poidsMax" DECIMAL(8,2) NOT NULL,
    "temperatureMin" DECIMAL(4,1),
    "temperatureMax" DECIMAL(4,1),
    "tauxPct" DECIMAL(5,2) NOT NULL,
    "tauxMinPct" DECIMAL(5,2),
    "tauxMaxPct" DECIMAL(5,2),
    "frequenceRepas" INTEGER NOT NULL DEFAULT 2,
    "source" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PalierRationnement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "nom" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cercle" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cercle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commune" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "cercleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commune_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "telephone" TEXT,
    "nom" TEXT NOT NULL,
    "prenom" TEXT,
    "motDePasse" TEXT,
    "role" "RoleUtilisateur" NOT NULL DEFAULT 'PISCICULTEUR',
    "regionId" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "derniereConnexion" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccesFerme" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fermeId" TEXT NOT NULL,
    "niveau" "NiveauAcces" NOT NULL,
    "debutLe" DATE,
    "finLe" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccesFerme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appareil" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "libelle" TEXT,
    "plateforme" TEXT,
    "derniereSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appareil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ferme" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "promoteur" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "cooperative" TEXT,
    "pays" TEXT NOT NULL DEFAULT 'Mali',
    "regionId" TEXT,
    "cercleId" TEXT,
    "communeId" TEXT,
    "village" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "altitude" DECIMAL(7,1),
    "dateCreation" DATE,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Ferme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Infrastructure" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "fermeId" TEXT NOT NULL,
    "typeInfrastructureId" TEXT NOT NULL,
    "longueur" DECIMAL(8,2),
    "largeur" DECIMAL(8,2),
    "diametre" DECIMAL(8,2),
    "profondeur" DECIMAL(6,2),
    "niveauRemplissage" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "superficie" DECIMAL(10,2),
    "volume" DECIMAL(10,2),
    "dateConstruction" DATE,
    "dateDerniereRehabilitation" DATE,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Infrastructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cycle" (
    "id" TEXT NOT NULL,
    "infrastructureId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "dateMiseEnCharge" DATE NOT NULL,
    "dateCloture" DATE,
    "statut" "StatutCycle" NOT NULL DEFAULT 'EN_COURS',
    "especeId" TEXT,
    "observation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "especeId" TEXT NOT NULL,
    "nombre" INTEGER NOT NULL,
    "poidsMoyenG" DECIMAL(8,2) NOT NULL,
    "coutUnitaire" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "dateMiseEnCharge" DATE NOT NULL,
    "origine" "OrigineLot",
    "souche" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mortalite" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "dateConstat" DATE NOT NULL,
    "nombre" INTEGER NOT NULL,
    "remplacement" INTEGER NOT NULL DEFAULT 0,
    "coutUnitaire" DECIMAL(10,2),
    "cause" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Mortalite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pesee" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "dateOperation" DATE NOT NULL,
    "tauxRationPct" DECIMAL(5,2),
    "observation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Pesee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Echantillon" (
    "id" TEXT NOT NULL,
    "peseeId" TEXT NOT NULL,
    "lotId" TEXT,
    "numero" INTEGER NOT NULL,
    "nombre" INTEGER NOT NULL,
    "poidsTotalG" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Echantillon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Distribution" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "peseeId" TEXT,
    "alimentId" TEXT NOT NULL,
    "dateDebut" DATE NOT NULL,
    "dateFin" DATE,
    "rationKgJour" DECIMAL(10,3),
    "quantiteTotaleKg" DECIMAL(10,3) NOT NULL,
    "prixKgApplique" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Distribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Traitement" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "produitSanitaireId" TEXT,
    "dateOperation" DATE NOT NULL,
    "quantite" DECIMAL(10,3),
    "prixUnitaire" DECIMAL(10,2),
    "motif" TEXT,
    "finDelaiAttente" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Traitement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recolte" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "lotId" TEXT,
    "especeId" TEXT,
    "dateOperation" DATE NOT NULL,
    "type" "TypeRecolte" NOT NULL,
    "poidsKg" DECIMAL(10,3) NOT NULL,
    "nombre" INTEGER,
    "prixKg" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "destination" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Recolte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Depense" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "categorie" "CategorieDepense" NOT NULL DEFAULT 'AUTRE',
    "description" TEXT,
    "montant" DECIMAL(12,2) NOT NULL,
    "dateOperation" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Depense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MesureEau" (
    "id" TEXT NOT NULL,
    "infrastructureId" TEXT NOT NULL,
    "cycleId" TEXT,
    "peseeId" TEXT,
    "dateMesure" DATE NOT NULL,
    "heure" VARCHAR(5),
    "temperature" DECIMAL(4,1),
    "transparenceSecchi" INTEGER,
    "oxygeneDissous" DECIMAL(5,2),
    "ph" DECIMAL(4,2),
    "ammoniacNh3" DECIMAL(6,3),
    "nitrites" DECIMAL(6,3),
    "alcalinite" DECIMAL(6,1),
    "salinite" DECIMAL(6,2),
    "observation" TEXT,
    "auteurId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MesureEau_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Simulation" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "nom" TEXT NOT NULL,
    "parametres" JSONB NOT NULL,
    "resultats" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Simulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConflitSync" (
    "id" TEXT NOT NULL,
    "tableCible" TEXT NOT NULL,
    "enregistrement" TEXT NOT NULL,
    "appareilId" TEXT,
    "userId" TEXT,
    "valeurRejetee" JSONB NOT NULL,
    "valeurRetenue" JSONB NOT NULL,
    "raison" TEXT NOT NULL,
    "resolu" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConflitSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Espece_codeFao_key" ON "Espece"("codeFao");

-- CreateIndex
CREATE UNIQUE INDEX "Espece_nom_key" ON "Espece"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "TypeInfrastructure_code_key" ON "TypeInfrastructure"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Aliment_nom_key" ON "Aliment"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "ProduitSanitaire_nom_key" ON "ProduitSanitaire"("nom");

-- CreateIndex
CREATE INDEX "PalierRationnement_especeId_poidsMin_poidsMax_idx" ON "PalierRationnement"("especeId", "poidsMin", "poidsMax");

-- CreateIndex
CREATE UNIQUE INDEX "PalierRationnement_especeId_poidsMin_poidsMax_temperatureMi_key" ON "PalierRationnement"("especeId", "poidsMin", "poidsMax", "temperatureMin", "temperatureMax");

-- CreateIndex
CREATE UNIQUE INDEX "Region_code_key" ON "Region"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Region_nom_key" ON "Region"("nom");

-- CreateIndex
CREATE INDEX "Cercle_regionId_idx" ON "Cercle"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "Cercle_regionId_nom_key" ON "Cercle"("regionId", "nom");

-- CreateIndex
CREATE INDEX "Commune_cercleId_idx" ON "Commune"("cercleId");

-- CreateIndex
CREATE UNIQUE INDEX "Commune_cercleId_nom_key" ON "Commune"("cercleId", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_telephone_key" ON "User"("telephone");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "AccesFerme_fermeId_idx" ON "AccesFerme"("fermeId");

-- CreateIndex
CREATE INDEX "AccesFerme_userId_idx" ON "AccesFerme"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AccesFerme_userId_fermeId_key" ON "AccesFerme"("userId", "fermeId");

-- CreateIndex
CREATE INDEX "Appareil_userId_idx" ON "Appareil"("userId");

-- CreateIndex
CREATE INDEX "Ferme_regionId_cercleId_idx" ON "Ferme"("regionId", "cercleId");

-- CreateIndex
CREATE INDEX "Ferme_updatedAt_idx" ON "Ferme"("updatedAt");

-- CreateIndex
CREATE INDEX "Infrastructure_fermeId_idx" ON "Infrastructure"("fermeId");

-- CreateIndex
CREATE INDEX "Infrastructure_updatedAt_idx" ON "Infrastructure"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Infrastructure_fermeId_nom_key" ON "Infrastructure"("fermeId", "nom");

-- CreateIndex
CREATE INDEX "Cycle_infrastructureId_statut_idx" ON "Cycle"("infrastructureId", "statut");

-- CreateIndex
CREATE INDEX "Cycle_updatedAt_idx" ON "Cycle"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Cycle_infrastructureId_numero_key" ON "Cycle"("infrastructureId", "numero");

-- CreateIndex
CREATE INDEX "Lot_cycleId_idx" ON "Lot"("cycleId");

-- CreateIndex
CREATE INDEX "Lot_updatedAt_idx" ON "Lot"("updatedAt");

-- CreateIndex
CREATE INDEX "Mortalite_lotId_dateConstat_idx" ON "Mortalite"("lotId", "dateConstat");

-- CreateIndex
CREATE INDEX "Mortalite_updatedAt_idx" ON "Mortalite"("updatedAt");

-- CreateIndex
CREATE INDEX "Pesee_cycleId_dateOperation_idx" ON "Pesee"("cycleId", "dateOperation");

-- CreateIndex
CREATE INDEX "Pesee_updatedAt_idx" ON "Pesee"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Pesee_cycleId_numero_key" ON "Pesee"("cycleId", "numero");

-- CreateIndex
CREATE INDEX "Echantillon_peseeId_idx" ON "Echantillon"("peseeId");

-- CreateIndex
CREATE INDEX "Echantillon_updatedAt_idx" ON "Echantillon"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Echantillon_peseeId_lotId_numero_key" ON "Echantillon"("peseeId", "lotId", "numero");

-- CreateIndex
CREATE INDEX "Distribution_cycleId_dateDebut_idx" ON "Distribution"("cycleId", "dateDebut");

-- CreateIndex
CREATE INDEX "Distribution_updatedAt_idx" ON "Distribution"("updatedAt");

-- CreateIndex
CREATE INDEX "Traitement_cycleId_dateOperation_idx" ON "Traitement"("cycleId", "dateOperation");

-- CreateIndex
CREATE INDEX "Traitement_updatedAt_idx" ON "Traitement"("updatedAt");

-- CreateIndex
CREATE INDEX "Recolte_cycleId_dateOperation_idx" ON "Recolte"("cycleId", "dateOperation");

-- CreateIndex
CREATE INDEX "Recolte_updatedAt_idx" ON "Recolte"("updatedAt");

-- CreateIndex
CREATE INDEX "Depense_cycleId_dateOperation_idx" ON "Depense"("cycleId", "dateOperation");

-- CreateIndex
CREATE INDEX "Depense_updatedAt_idx" ON "Depense"("updatedAt");

-- CreateIndex
CREATE INDEX "MesureEau_infrastructureId_dateMesure_idx" ON "MesureEau"("infrastructureId", "dateMesure");

-- CreateIndex
CREATE INDEX "MesureEau_cycleId_dateMesure_idx" ON "MesureEau"("cycleId", "dateMesure");

-- CreateIndex
CREATE INDEX "MesureEau_updatedAt_idx" ON "MesureEau"("updatedAt");

-- CreateIndex
CREATE INDEX "Simulation_userId_idx" ON "Simulation"("userId");

-- CreateIndex
CREATE INDEX "ConflitSync_tableCible_enregistrement_idx" ON "ConflitSync"("tableCible", "enregistrement");

-- CreateIndex
CREATE INDEX "ConflitSync_resolu_idx" ON "ConflitSync"("resolu");

-- AddForeignKey
ALTER TABLE "PalierRationnement" ADD CONSTRAINT "PalierRationnement_especeId_fkey" FOREIGN KEY ("especeId") REFERENCES "Espece"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cercle" ADD CONSTRAINT "Cercle_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commune" ADD CONSTRAINT "Commune_cercleId_fkey" FOREIGN KEY ("cercleId") REFERENCES "Cercle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccesFerme" ADD CONSTRAINT "AccesFerme_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccesFerme" ADD CONSTRAINT "AccesFerme_fermeId_fkey" FOREIGN KEY ("fermeId") REFERENCES "Ferme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appareil" ADD CONSTRAINT "Appareil_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ferme" ADD CONSTRAINT "Ferme_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ferme" ADD CONSTRAINT "Ferme_cercleId_fkey" FOREIGN KEY ("cercleId") REFERENCES "Cercle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ferme" ADD CONSTRAINT "Ferme_communeId_fkey" FOREIGN KEY ("communeId") REFERENCES "Commune"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Infrastructure" ADD CONSTRAINT "Infrastructure_fermeId_fkey" FOREIGN KEY ("fermeId") REFERENCES "Ferme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Infrastructure" ADD CONSTRAINT "Infrastructure_typeInfrastructureId_fkey" FOREIGN KEY ("typeInfrastructureId") REFERENCES "TypeInfrastructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_infrastructureId_fkey" FOREIGN KEY ("infrastructureId") REFERENCES "Infrastructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_especeId_fkey" FOREIGN KEY ("especeId") REFERENCES "Espece"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_especeId_fkey" FOREIGN KEY ("especeId") REFERENCES "Espece"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mortalite" ADD CONSTRAINT "Mortalite_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pesee" ADD CONSTRAINT "Pesee_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Echantillon" ADD CONSTRAINT "Echantillon_peseeId_fkey" FOREIGN KEY ("peseeId") REFERENCES "Pesee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Echantillon" ADD CONSTRAINT "Echantillon_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_peseeId_fkey" FOREIGN KEY ("peseeId") REFERENCES "Pesee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_alimentId_fkey" FOREIGN KEY ("alimentId") REFERENCES "Aliment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Traitement" ADD CONSTRAINT "Traitement_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Traitement" ADD CONSTRAINT "Traitement_produitSanitaireId_fkey" FOREIGN KEY ("produitSanitaireId") REFERENCES "ProduitSanitaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recolte" ADD CONSTRAINT "Recolte_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recolte" ADD CONSTRAINT "Recolte_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recolte" ADD CONSTRAINT "Recolte_especeId_fkey" FOREIGN KEY ("especeId") REFERENCES "Espece"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Depense" ADD CONSTRAINT "Depense_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesureEau" ADD CONSTRAINT "MesureEau_infrastructureId_fkey" FOREIGN KEY ("infrastructureId") REFERENCES "Infrastructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesureEau" ADD CONSTRAINT "MesureEau_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesureEau" ADD CONSTRAINT "MesureEau_peseeId_fkey" FOREIGN KEY ("peseeId") REFERENCES "Pesee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesureEau" ADD CONSTRAINT "MesureEau_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Simulation" ADD CONSTRAINT "Simulation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
