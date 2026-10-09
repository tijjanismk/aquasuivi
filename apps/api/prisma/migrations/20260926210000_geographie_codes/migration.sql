-- Codes officiels du découpage administratif (prisma/data/decoupage_mali.json).
-- Nullables : les lignes saisies avant le chargement du découpage n'en ont pas.

-- AlterTable
ALTER TABLE "Cercle" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "Commune" ADD COLUMN     "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Cercle_code_key" ON "Cercle"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Commune_code_key" ON "Commune"("code");
