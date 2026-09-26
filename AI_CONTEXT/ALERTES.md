# Alertes — ce qui demande vérification

Généré depuis `carte.json`, puis vérifié à la main. Date : 2026-09-25.

> `carte.json` date d'avant l'écriture de `apps/api/src/` et
> `apps/admin/` : il ne les connaît pas. À régénérer.

## Sécurité — ce qui reste ouvert

L'API est fermée par défaut depuis D18 : JWT, cloisonnement par
`AccesFerme`, référentiels en écriture pour `ADMIN` seul. Couvert par
`test:auth`. Restent, **avant toute exposition réseau** :

- **CORS `origin: true`** (`main.ts`) : à restreindre aux domaines de
  l'admin et de la PWA.
- **Aucune limite de tentatives** sur `/auth/connexion` et
  `/auth/inscription` : force brute et inscriptions en masse possibles.
- **Inscription sans vérification du numéro** (DECISIONS.md, en attente).
- **Rôle porté par le jeton** : rétrograder un compte prend effet au plus
  15 minutes après (l'accès aux fermes, lui, est relu à chaque requête).

## Données de référence

- `tauxSurvieRef` est saisi **en fraction** (0,9) dans le seed alors que
  les indicateurs donnent la survie **en pourcentage** (94). Le moteur
  d'alertes accepte les deux ; l'admin devrait l'afficher en %.

## PWA — à savoir

- **Composants UI dupliqués** : `apps/pwa/src/ui/` est une copie de
  `apps/admin/src/composants/ui/` (bouton, champs, carte). Deux copies à
  garder alignées ; les factoriser dans un paquet `@aqua/ui` le jour où
  l'une diverge.
- **Contexte des contrôles écrit deux fois** : `apps/api/.../controles.service.ts`
  (Prisma) et `apps/pwa/src/saisie.ts` (Dexie). Les **règles** sont
  uniques (`@aqua/shared`), le chargement du contexte non. Toute règle
  qui demande un contexte nouveau se branche des deux côtés.
- **Se déconnecter vide le téléphone** (téléphone prêté) : l'écran
  prévient s'il reste des saisies non envoyées, mais n'empêche pas.
- **iOS** peut purger le stockage d'une PWA inutilisée plusieurs semaines ;
  `navigator.storage.persist()` est demandé, sans garantie.
- `@nestjs/jwt` 11 annonce Nest ≤ 11 en dépendance pair ; il fonctionne
  avec Nest 12 (tests verts), l'avertissement de `pnpm install` est connu.

## Couverture de test de l'API et de l'admin

`pnpm test:e2e` enchaîne quatre parcours (voir `modules/e2e.md`) :

- **`test:cycle`** — rejoue le cycle de référence B4 via l'API et compare
  les 16 indicateurs à `test/b4.ts`. Couvre au passage la géométrie
  calculée à l'écriture, le délai d'attente déduit, les dates de terrain
  sans dérive de fuseau, et la suppression douce (la ligne sort des
  lectures, y compris en accès direct, mais reste en base).
- **`test:admin`** — en navigateur réel : création, modification,
  recherche, désactivation sans suppression, contrainte SQL traduite,
  formatage monétaire, changement de référentiel.

- **`test:saisie`** — en navigateur : ferme → bassin → cycle → lot →
  dépense, superficie calculée à l'écriture, sections du cycle,
  indicateurs recalculés, date sans dérive de fuseau.
- **`test:mcp`** — le serveur MCP compilé, parlé en JSON-RPC sur stdio.

**Ce que rien ne couvre encore** : la géographie, la pagination au-delà
de la première page, les 409 d'unicité vus depuis l'admin, les fiches
pesée et lot (échantillons, mortalités) et la **modification** d'une
ligne de saisie depuis l'admin — seule la création est parcourue.

Le parcours écrit dans la **base de développement** et nettoie avant et
après lui. Une base de test dédiée serait plus propre ; en attendant, ne
pas le lancer sur une base qui compte.

## Orphelins signalés par le script

`geometrie.ts` a trouvé son appelant : l'API le branche à l'écriture
d'une infrastructure.

Reste `packages/shared/src/rationnement.ts` — **API publique sans
consommateur**. Ce n'est pas du code mort : la ration conseillée doit
s'afficher à la saisie sur mobile (étape 7), et rien ne l'appelle encore.
**Ne pas supprimer.**

## Résolu — lignes supprimées, contrôles de cycle, délai forgé

- Une pesée, un lot ou une récolte supprimés **comptaient encore** dans
  les indicateurs : l'extension de suppression douce ne filtre que le
  premier niveau d'une requête. `cycles.service.ts` filtre désormais
  chaque `include`. **Règle** : tout `include` d'une table de saisie
  porte `where: { deletedAt: null }`.
- Supprimer un parent laisse désormais ses enfants hors des lectures :
  la suppression descend l'arbre, à la même date (`supprimer()`).
- Le client pouvait fournir `finDelaiAttente` et rendre conforme une
  récolte qui ne l'était pas. Recalculé dès que le produit est connu.
- `mortalite_valeurs_positives` remontait en 500 : traduite.
- Aucun contrôle de cohérence sur un cycle : voir D20.

## Résolu — superficie, volume et délai d'attente

`dimensionsCalculees()` est désormais appelé à chaque écriture d'une
`Infrastructure`, et `finDelaiAttente` est déduit du produit sanitaire à
l'écriture d'un `Traitement` (`apps/api/src/saisie/saisie.service.ts`).
Les deux sont vérifiés par `pnpm --filter @aqua/e2e test:cycle`.

## Couverture de test

`test/b4.ts` couvre `indicateurs.ts` (16 assertions, cycle réel Kotouba
B4) et, par ricochet, `dates.ts`.

**Non couverts :** `geometrie.ts`, `rationnement.ts`. Zéro assertion.
Les bornes de palier (`>= poidsMin`, `< poidsMax`, priorité thermique)
et le `niveauRemplissage` sont exactement le genre de logique où une
inversion de borne passe inaperçue.

## Fichiers les plus sollicités

Modifier ces fichiers a le plus d'effets de bord :

| Fichier | Importé par |
|---|---|
| `packages/shared/src/types.ts` | 5 fichiers — **toute signature change casse partout** |
| `packages/shared/src/dates.ts` | 1 |
| `packages/shared/src/indicateurs.ts` | 1 (le test) |

## Symboles dupliqués

Aucun.

## Divergences connues entre le schéma et les types partagés

`packages/shared/src/types.ts` est volontairement découplé de Prisma
(voir DECISIONS.md, D2). Deux écarts à connaître :

- `Espece.codeFao` côté shared est `string | null`, côté Prisma
  `@db.VarChar(3) @unique`. La contrainte de longueur n'existe que
  côté base.
- Les `Decimal` Prisma arrivent en `number` côté shared. La conversion
  est faite par `apps/api/src/cycles/cycles.service.ts`, champ par champ,
  **avant** l'appel au calcul. L'intercepteur de sortie n'y suffit pas :
  il agit après. Un `Prisma.Decimal` passé tel quel concaténerait au lieu
  d'additionner.

## Dette déclarée dans le code

- `seed.ts` — délais d'attente sanitaires = **places tenues**, à
  confirmer auprès du service vétérinaire avant production.
- `seed.ts` — un seul `codeFao` renseigné (`TLN`). Les 7 autres espèces
  attendent leur code ASFIS.
- Géographie : une seule région (Sikasso), deux cercles, cinq communes.
  Le Mali complet reste à charger.
- `seed.ts` utilise `createMany({ skipDuplicates: true })` : le relancer
  **ne met pas à jour** une ligne existante, il la saute. Corriger une
  valeur du référentiel demande de passer par l'admin ou par SQL.
- `docker-compose.yml` déclare `aqua/aqua` là où le `.env` utilise
  `postgres`/`user`. Les deux divergent — à aligner avant de repasser
  sur Docker.

## Résolu depuis la dernière carte

- `datasource.url` retiré du schéma, `prisma.config.ts` en place :
  `db:migrate` et `db:seed` fonctionnent.
- La migration initiale manquait ; elle existe et précède désormais
  `contraintes_metier`.
- Le dépôt avait été installé avec `npm` par-dessus pnpm. Nettoyé.
