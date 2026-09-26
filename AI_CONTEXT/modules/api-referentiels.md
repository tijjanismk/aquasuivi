# Module : api/référentiels

Rôle : exposer les référentiels administrables (D10) et la géographie,
avec les conversions et traductions d'erreur que réclame la frontière
du domaine.

## Fichiers
- `apps/api/src/main.ts` — amorçage, préfixe `/api`, CORS, chargement du
  `.env` racine
- `apps/api/src/prisma/prisma.service.ts` — `PrismaClient` + adaptateur
  `PrismaPg`, extension de filtrage `deletedAt`
- `apps/api/src/referentiels/` — contrôleur et service CRUD
- `apps/api/src/geographie/geographie.controller.ts` — lecture seule
- `apps/api/src/common/decimal.interceptor.ts` — `Decimal → number`
- `apps/api/src/common/prisma-exception.filter.ts` — contraintes SQL en
  erreurs métier
- `apps/api/src/sante.controller.ts` — comptage des référentiels

## Routes

| Méthode | Chemin | Effet |
|---|---|---|
| `GET` | `/api/sante` | état base + volumétrie des référentiels |
| `GET` | `/api/referentiels/:ressource` | liste paginée, `x-total-count` en en-tête |
| `GET` | `/api/referentiels/:ressource/:id` | une ligne |
| `POST` | `/api/referentiels/:ressource` | création |
| `PATCH` | `/api/referentiels/:ressource/:id` | modification |
| `DELETE` | `/api/referentiels/:ressource/:id` | **désactivation**, pas suppression |
| `GET` | `/api/geographie/{regions,cercles,communes}` | lecture seule |

`:ressource` ∈ `especes` · `types-infrastructure` · `aliments` ·
`produits-sanitaires` · `paliers`. La correspondance segment → modèle
Prisma est une **liste blanche** (`RESSOURCES`) : le segment vient de
l'URL et ne doit jamais atteindre un modèle non administrable.

Paramètres de liste : `_start`, `_end`, `_sort`, `_order`, `q`
(recherche texte), `inactifs=true`. Ce sont les conventions de
`@refinedev/simple-rest` — les changer casse l'admin.

## Règles métier
- [CONFIRMÉ] `DELETE` **désactive** (`actif: false`) au lieu de
  supprimer : les clés étrangères sont en `Restrict` et les lignes
  passées doivent rester lisibles — `referentiels.service.ts`
- [CONFIRMÉ] La liste masque les lignes inactives sauf `inactifs=true`
- [CONFIRMÉ] Extension Prisma : toute lecture d'une table de saisie
  reçoit `deletedAt: null` (D12). Les référentiels en sont exclus, ils
  portent `actif` — `prisma.service.ts`
- [CONFIRMÉ] Tout `Decimal` est converti en `number` avant sérialisation
  (sans quoi le client concatène au lieu d'additionner) —
  `decimal.interceptor.ts`
- [CONFIRMÉ] Les contraintes `CHECK` et l'index partiel de D7 remontent
  en **422 avec un message en français**, pas en 500 —
  `prisma-exception.filter.ts`
- [CONFIRMÉ] Un champ inconnu est refusé en 400 : la validation repose
  sur Prisma lui-même, il n'y a pas de DTO

## Piège : la forme des erreurs du pilote
Avec un adaptateur Prisma 7, un `P2002` arrive avec `message` **vide**.
Le nom de la contrainte n'existe que dans
`meta.driverAdapterError.cause.constraint.index`, sous forme de nom
d'index PostgreSQL (`Aliment_nom_key`). Toute logique qui lit
`erreur.message` ou `meta.target` échoue silencieusement.

## Non couvert
Aucune **authentification** : `DECISIONS.md` la classe en décision en
attente, et l'API est ouverte en développement. À traiter avant toute
exposition réseau. Pas de CRUD des cycles, ni `/cycles/:id/indicateurs`
— voir ETAPES.md étape 4.
