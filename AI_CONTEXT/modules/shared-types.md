# Module : shared/types

Rôle : contrats de domaine, volontairement découplés de tout ORM.

## Fichiers
- `packages/shared/src/types.ts` (164 l.) — interfaces et unions. Aucun
  code exécutable.

## Types exposés
- `DateISO` = `string` — « AAAA-MM-JJ »
- Unions : `MesureBase`, `FormeInfrastructure`, `StatutCycle`,
  `TypeRecolte`
- Entités : `Espece`, `InfrastructureDim`, `Infrastructure`, `Lot`,
  `Mortalite`, `Pesee`, `Echantillon`, `Distribution`, `Traitement`,
  `Recolte`, `Depense`, `Cycle`, `PalierRationnement`
- Agrégat : `CycleComplet` — tout ce qu'il faut pour calculer un cycle,
  y compris `especes[]` pour les repères de performance

## Entrant
Importé par : `dates.ts`, `geometrie.ts`, `rationnement.ts`,
`indicateurs.ts`, `index.ts` — **5 fichiers, le plus sollicité du
dépôt**. Toute modification de signature ici casse partout.

## Sortant
Rien. Feuille de l'arbre de dépendances.

## Règles métier
- [CONFIRMÉ] Unités figées pour tout le projet : poisson en **grammes**,
  biomasse et aliment en **kilogrammes**, montants en **F CFA entiers**,
  dates en chaînes ISO — `types.ts:8-16`
- [CONFIRMÉ] Aucun objet `Date` : une date de terrain n'a ni heure ni
  fuseau, et c'est précisément ce qui cassait à la synchronisation —
  `types.ts:13-15`
- [CONFIRMÉ] Aucune importation d'ORM : les mêmes fonctions tournent sur
  des lignes Prisma et sur des enregistrements WatermelonDB —
  `types.ts:4-6`

## Écarts connus avec `schema.prisma`
- `Espece.codeFao` ici `string | null`, en base `@db.VarChar(3) @unique` :
  la contrainte de longueur n'existe que côté base.
- Les champs `Decimal` du schéma sont des `number` ici. La conversion
  incombe à l'adaptateur de l'API, **non écrit**.
- `Mortalite.dateConstat` ici, `dateConstat` en base : cohérent. Mais
  `Pesee`, `Recolte`, `Traitement`, `Depense` utilisent `dateOperation`
  des deux côtés — ne pas confondre les deux noms.
