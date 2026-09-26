-- Contraintes que le langage de schéma Prisma ne sait pas exprimer.
-- À exécuter après `prisma migrate dev`, ou à coller dans la migration générée.

-- 1. Une infrastructure ne peut porter qu'UN SEUL cycle ouvert à la fois.
--    Index partiel : les cycles clos et supprimés en sortent, donc ne gênent pas.
--    Cette contrainte est aussi le garde-fou de la synchronisation : si deux
--    appareils ouvrent un cycle hors ligne sur le même bassin, le second est
--    rejeté par la base. C'est une vraie erreur métier, à montrer à l'agent,
--    pas un incident technique à contourner.
CREATE UNIQUE INDEX IF NOT EXISTS cycles_un_seul_ouvert_par_infrastructure
  ON "Cycle" ("infrastructureId")
  WHERE "dateCloture" IS NULL AND "deletedAt" IS NULL;

-- 2. Un échantillon pèse forcément au moins un poisson.
ALTER TABLE "Echantillon"
  ADD CONSTRAINT echantillon_nombre_positif CHECK ("nombre" > 0);

-- 3. Un taux de rationnement se situe entre 0 et 10 % de la biomasse
--    (règle reprise telle quelle du cahier des charges d'origine).
ALTER TABLE "Pesee"
  ADD CONSTRAINT pesee_taux_plausible
  CHECK ("tauxRationPct" IS NULL OR ("tauxRationPct" >= 0 AND "tauxRationPct" <= 10));

ALTER TABLE "PalierRationnement"
  ADD CONSTRAINT palier_taux_plausible CHECK ("tauxPct" >= 0 AND "tauxPct" <= 30);

-- 4. Un cycle ne se clôture pas avant d'avoir commencé.
ALTER TABLE "Cycle"
  ADD CONSTRAINT cycle_cloture_apres_charge
  CHECK ("dateCloture" IS NULL OR "dateCloture" >= "dateMiseEnCharge");

-- 5. Une mortalité ne peut pas être négative, un remplacement non plus.
ALTER TABLE "Mortalite"
  ADD CONSTRAINT mortalite_valeurs_positives
  CHECK ("nombre" >= 0 AND "remplacement" >= 0);

-- 6. Accélère le pull de synchronisation, qui filtre toujours sur updatedAt
--    par ferme. Index composés sur les tables les plus écrites.
CREATE INDEX IF NOT EXISTS pesee_sync ON "Pesee" ("updatedAt", "cycleId");
CREATE INDEX IF NOT EXISTS recolte_sync ON "Recolte" ("updatedAt", "cycleId");
CREATE INDEX IF NOT EXISTS distribution_sync ON "Distribution" ("updatedAt", "cycleId");
