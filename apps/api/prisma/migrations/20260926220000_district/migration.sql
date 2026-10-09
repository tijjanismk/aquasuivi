-- Le district de Bamako est au premier niveau du découpage sans être une région.

-- CreateEnum
CREATE TYPE "TypeTerritoire" AS ENUM ('REGION', 'DISTRICT');

-- AlterTable
ALTER TABLE "Region" ADD COLUMN     "type" "TypeTerritoire" NOT NULL DEFAULT 'REGION';
