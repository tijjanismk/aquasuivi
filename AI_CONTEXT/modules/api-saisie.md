# Module : api/saisie

Rôle : CRUD des tables de terrain et calcul des indicateurs d'un cycle.

## Fichiers
- `apps/api/src/saisie/saisie.config.ts` — **le fichier à ouvrir en premier** :
  les douze ressources, leurs filtres autorisés, leur tri, leurs relations
- `apps/api/src/saisie/saisie.service.ts` — CRUD générique + règles dérivées
- `apps/api/src/saisie/saisie.controller.ts` — routes
- `apps/api/src/cycles/cycles.service.ts` — agrégat et indicateurs
- `apps/api/src/common/domaine.ts` — frontière : dates et décimaux

## Routes

`/api/saisie/:ressource` en `GET` (liste paginée, `x-total-count`), `GET /:id`,
`POST`, `PATCH /:id`, `DELETE /:id`.

`:ressource` ∈ `fermes` · `infrastructures` · `cycles` · `lots` ·
`mortalites` · `pesees` · `echantillons` · `distributions` ·
`traitements` · `recoltes` · `depenses` · `mesures-eau`.

Filtres : les colonnes listées dans `filtres` pour la ressource, en clair
dans l'URL (`?cycleId=…&statut=EN_COURS`). Liste blanche stricte.

`GET /api/cycles/:id/indicateurs` charge l'agrégat complet et le passe à
`calculerIndicateurs`.

## Règles métier
- [CONFIRMÉ] `DELETE` pose `deletedAt`, il ne supprime pas (D12). Les
  lectures sont filtrées par l'extension de `PrismaService`
- [CONFIRMÉ] L'identifiant peut venir du corps de la requête : deux
  téléphones hors réseau doivent créer sans collision (D3)
- [CONFIRMÉ] **Infrastructure** : `superficie` et `volume` sont dérivés
  des dimensions par `dimensionsCalculees()` du paquet partagé, à chaque
  écriture. La `forme` vient du `TypeInfrastructure`, pas de
  l'infrastructure — le service va donc la chercher
- [CONFIRMÉ] **Traitement** : `finDelaiAttente` = `dateOperation` + délai
  du produit, calculé si absent. Sans lui, aucune récolte n'est jamais
  signalée non conforme — c'est une règle de sécurité sanitaire
- [CONFIRMÉ] Les dates de terrain traversent la frontière en
  « AAAA-MM-JJ » dans les deux sens ; jamais d'horodatage ISO
- [CONFIRMÉ] **Ferme** : la commune doit appartenir au cercle, le cercle
  à la région, sinon 422 `RATTACHEMENT_INCOHERENT`
  (`controles.service.ts:150`, `territoire()`). S'applique aussi aux
  fermes reçues par la synchronisation. Sans cela, la consolidation
  compterait la même ferme dans deux territoires selon le niveau

## Piège : la conversion avant le calcul

`calculerIndicateurs` attend des **nombres** et des **chaînes de date**.
Lui passer des lignes Prisma telles quelles échoue en silence : les
`Decimal` se concatènent au lieu de s'additionner et les comparaisons de
dates deviennent fausses. `cycles.service.ts` convertit donc champ par
champ, avec des fonctions qui font réellement le travail — pas des casts
de type, qui mentiraient au compilateur sans rien convertir.

L'intercepteur de sortie (`frontiere.interceptor.ts`) ne suffit pas ici :
il agit après le calcul, pas avant.

## Vérification

`pnpm --filter @aqua/e2e test:cycle` rejoue le cycle de référence B4 via
l'API et compare les 16 valeurs à `packages/shared/test/b4.ts`. Si une
conversion dérive, ce test tombe alors que `test:shared` reste vert.

## Non couvert
Aucune **authentification** ni contrôle d'accès par ferme. Pas de
validation applicative : on s'appuie sur Prisma et sur les contraintes
SQL, dont les refus sont traduits par `prisma-exception.filter.ts`.
