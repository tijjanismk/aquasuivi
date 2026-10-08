-- D29 : la pêche de contrôle fixe une ration journalière qui court jusqu'à la
-- pêche suivante. La quantité de la période se déduit de la ration ; elle
-- n'est saisie que lorsqu'elle est réellement mesurée.

-- AlterTable
ALTER TABLE "Distribution" ALTER COLUMN "quantiteTotaleKg" DROP NOT NULL;

-- Hors langage Prisma : une distribution sans ration ni quantité ne compte rien.
ALTER TABLE "Distribution"
  ADD CONSTRAINT distribution_ration_ou_quantite
  CHECK ("rationKgJour" IS NOT NULL OR "quantiteTotaleKg" IS NOT NULL);
