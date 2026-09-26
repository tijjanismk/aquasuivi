# Module : api/persistance

Rôle : schéma relationnel PostgreSQL, contraintes métier et
référentiels de démarrage.

## Fichiers
- `apps/api/prisma/schema.prisma` (732 l.) — 25 modèles, 10 énumérations
- `apps/api/prisma.config.ts` — **à la racine de `apps/api/`** : ailleurs,
  Prisma 7 ne le découvre pas et réclame `--config` à chaque commande
- `apps/api/prisma/migrations/<horodatage>_init/migration.sql` — création
  des tables, engendrée par `migrate dev`
- `apps/api/prisma/migrations/<horodatage>_contraintes_metier/migration.sql`
  (41 l.) — ce que le langage Prisma ne sait pas exprimer. **Postérieure à
  `_init`** : elle contraint des tables que `_init` crée
- `apps/api/prisma/seed.ts` (~470 l.) — référentiels. Rejouable via
  `createMany({ skipDuplicates: true })`, **pas via `upsert`** : relancer
  le seed ne met donc pas à jour une ligne existante, il la saute

## Modèles, par famille

**Référentiels** (administrés au back-office, répliqués en lecture seule
sur mobile) : `Espece`, `TypeInfrastructure`, `Aliment`,
`ProduitSanitaire`, `PalierRationnement`

**Géographie** : `Region` → `Cercle` → `Commune`

**Identité et droits** : `User`, `AccesFerme`, `Appareil`

**Exploitation** : `Ferme`, `Infrastructure`

**Élevage** : `Cycle` → `Lot` → (`Mortalite`, `Echantillon`, `Recolte`),
`Pesee` → `Echantillon`, `Distribution`, `Traitement`, `Depense`,
`MesureEau`

**Autres** : `Simulation`, `ConflitSync`

## Énumérations
`RoleUtilisateur` (PISCICULTEUR · ENCADREUR · SECTEUR · REGION ·
NATIONAL · ADMIN) · `NiveauAcces` (PROPRIETAIRE · ENCADREUR · LECTURE) ·
`FormeInfrastructure` · `MesureBase` · `MilieuFao` · `SystemeFao` ·
`StatutCycle` · `TypeRecolte` · `OrigineLot` · `CategorieDepense`

## Contenu du seed
8 espèces (seul le Tilapia du Nil a un `codeFao` : `TLN`) · 12 types
d'infrastructure, du bassin en ciment au RAS, chacun avec un `code`
unique (`BASSIN_CIMENT`, `ETANG_TERRE`, `RAS`…) · 8 aliments (Sabalagnon
local, gamme Skretting, son de riz, tourteau de coton) · 5 produits
sanitaires · 12 paliers de rationnement (tilapia, clarias) · géographie :
région Sikasso, cercles Sikasso (communes Kotouba, Siby, Kaladjan) et
Koulikoro (Koulikoro, Niono).

## Règles métier
- [CONFIRMÉ] Clés primaires **ULID générés par le client** ; le
  `@default(ulid())` ne sert qu'aux lignes nées côté serveur —
  `schema.prisma:11-13`
- [CONFIRMÉ] **Un seul cycle ouvert par infrastructure** : index unique
  partiel `WHERE dateCloture IS NULL AND deletedAt IS NULL`. Garde-fou
  de la synchronisation ; le rejet est une erreur métier à montrer à
  l'agent — `migration.sql:10-12`
- [CONFIRMÉ] `Echantillon.nombre > 0` — `migration.sql:15-16`
- [CONFIRMÉ] `Pesee.tauxRationPct` entre 0 et 10 % —`migration.sql:20-22`
- [CONFIRMÉ] `PalierRationnement.tauxPct` entre 0 et 30 % —
  `migration.sql:24-25`
- [CONFIRMÉ] `dateCloture >= dateMiseEnCharge` — `migration.sql:28-30`
- [CONFIRMÉ] `Mortalite.nombre >= 0` et `remplacement >= 0` —
  `migration.sql:33-35`
- [CONFIRMÉ] Espèce portée par le `Lot` ; `Cycle.especeId` n'est qu'une
  espèce dominante facultative, pour filtrage et affichage —
  `schema.prisma:435-438, 459-460`
- [CONFIRMÉ] Mortalité datée par elle-même (`dateConstat`), pas par la
  pêche de contrôle — `schema.prisma:487-488`
- [CONFIRMÉ] Échantillons conservés individuellement, pas leur moyenne —
  `schema.prisma:531-533`
- [CONFIRMÉ] Géographie en clés étrangères, jamais en texte libre —
  `schema.prisma:232-234`
- [CONFIRMÉ] `AccesFerme` est une relation `@@unique([userId, fermeId])` :
  un encadreur a autant de lignes que de fermes suivies —
  `schema.prisma:309-323`
- [CONFIRMÉ] `codeFao` vide plutôt que deviné : un code faux agrégerait
  la production nationale sous la mauvaise espèce —`schema.prisma:111-113`
- [CONFIRMÉ] `prixKgApplique` fige le prix à l'achat : le référentiel
  évolue, les charges passées non — `schema.prisma:570-571`
- [CONFIRMÉ] `finDelaiAttente` = `dateOperation` + délai du produit ;
  toute récolte antérieure est non conforme — `schema.prisma:592-594`
- [CONFIRMÉ] `Ferme.latitude/longitude` en `Decimal(10,7)` ≈ 1 cm ;
  l'ancien `float(20,20)` ne pouvait pas stocker 12,65 —
  `schema.prisma:364-367`
- [CONFIRMÉ] `MesureEau.heure` conservée : l'oxygène varie fortement
  dans la journée, 6 mg/L à seize heures ne dit rien du minimum de
  l'aube — `schema.prisma:663-665`
- [CONFIRMÉ] `MesureEau` n'exige rien au-delà de la date : une mesure
  partielle vaut mieux qu'un relevé abandonné — `schema.prisma:649-652`
- [CONFIRMÉ] Soft delete (`deletedAt`) sur les tables de saisie, `actif`
  sur les référentiels
- [CONFIRMÉ] `updatedAt` indexé sur toutes les tables synchronisées ;
  index composés `(updatedAt, cycleId)` sur les plus écrites —
  `migration.sql:39-41`
- [CONFIRMÉ] Délais d'attente du seed = **places tenues**, à confirmer
  auprès du service vétérinaire : règle de sécurité sanitaire des
  aliments, pas paramètre libre — `seed.ts:89-91`

## Suppressions en cascade
`Cascade` : `Ferme → Infrastructure → Cycle → Lot/Pesee/…` et
`User → AccesFerme/Appareil`.
`Restrict` : `Espece → Lot`, `Aliment → Distribution`,
`TypeInfrastructure → Infrastructure`, `Region → Cercle → Commune` —
un référentiel utilisé ne se supprime pas.
`SetNull` : liens facultatifs (`Cycle.especeId`, `Recolte.lotId`,
`Echantillon.lotId`, `Ferme.regionId`…).

## État
Débloqué. `datasource` ne porte plus d'`url` ; la connexion passe par
`prisma.config.ts` (CLI) et par l'adaptateur `PrismaPg` (exécution).
`db:migrate` et `db:seed` s'enchaînent.

## Pièges rencontrés, à ne pas refaire

- **Ne jamais installer avec `npm`.** Le dépôt est un espace de travail
  pnpm ; un `npm install` y écrit un `package-lock.json`, aplatit les
  dépendances à la racine et casse l'isolation dont dépend `apps/api`.
- **Le client Prisma vit dans `node_modules` et disparaît à chaque
  réinstallation.** D'où le `postinstall: prisma generate` de
  `apps/api/package.json`. Sans lui, un `pnpm install` qui reconstruit
  l'arbre laisse `@prisma/client` sans types — et le typecheck échoue sur
  `has no exported member 'PrismaClient'`.
- **`seed.ts` doit être typechecké** (`tsconfig.typecheck.json`). Il avait
  dérivé du schéma sur huit champs sans que rien ne le signale.
- **Les erreurs du pilote sont imbriquées.** Avec un adaptateur, un P2002
  arrive avec `message` vide : le nom de la contrainte n'est que dans
  `meta.driverAdapterError.cause.constraint`. Voir
  `apps/api/src/common/prisma-exception.filter.ts`.

## Code applicatif
`PrismaService` (adaptateur `pg` + filtre `deletedAt`), CRUD des
référentiels, géographie en lecture, adaptation `Decimal → number` et
traduction des contraintes SQL en erreurs métier. Voir
`modules/api-referentiels.md`.
