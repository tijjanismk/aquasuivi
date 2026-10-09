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

## Mise en ligne — pas encore éprouvée

- `deploy/Dockerfile`, `deploy/docker-compose.yml` et `deploy/Caddyfile`
  **n'ont pas été exécutés** : le démon Docker ne tourne pas sur la machine
  de développement. Ont été vérifiés : l'interpolation du compose
  (`docker compose config`), `pnpm install --frozen-lockfile`, chaque
  commande de build, et le démarrage de l'API sans fichier `.env`. Le
  Caddyfile a été relu, pas validé par `caddy adapt`.
  → Premier déploiement : lancer d'abord sur un serveur de préproduction.
- Une seule instance d'API : la limite de tentatives est en mémoire.

## Administration — à savoir

- **Rôle porté par le jeton** : un changement de rôle prend effet au plus
  15 minutes après ; mot de passe changé et désactivation, eux, révoquent
  aussitôt les jetons de rafraîchissement.
- **Consolidation** : recalcul de chaque cycle (2 000 au plus, signalé
  `tronque`). Pour un tableau de bord national, matérialiser les
  indicateurs des cycles bouclés.
- **Géographie** : le Mali est chargé, Bamako compris ;
  les fermes sans territoire tombent dans « Non renseigné ».

## Interface et carte — à savoir

- **Carte** : fond OpenStreetMap servi par Internet ; hors ligne, seuls
  les points restent. Politique d'usage d'OSM : pas de trafic lourd ni
  de pré-téléchargement — au-delà d'un usage d'administration, héberger
  ses tuiles (D25). La CSP de `deploy/Caddyfile` autorise
  `tile.openstreetmap.org` : **changer de fournisseur = changer la CSP**.
- **`index.css` et `ui/` sont dupliqués** entre admin et PWA : toute
  retouche du thème ou d'un composant se fait dans les deux.
- **Ajouter un composant shadcn** : `shadcn add` 4.21 écrit
  `import { cn } from "cn"` (et installe un paquet npm `cn`) et écrase
  `button.tsx`. Procédure sûre : `--dry-run` pour voir ce qui change,
  ou lire `https://ui.shadcn.com/r/styles/new-york-v4/<nom>.json`, copier
  `files[].content`, remplacer `"cn"` par `"@/lib/utils"` et
  `@/registry/new-york-v4/ui/` par l'alias de l'app, ajouter soi-même les
  `dependencies` listées. Le registre expire souvent ici (réseau lent).
- **Cases à cocher Radix** : un `<button role="checkbox">`, pas un
  `<input>`. `__saisir` (e2e) lit `aria-checked` ; un test qui ferait
  `.checked` lirait `undefined`.
- **Versions bloquées** (D26) : API en TypeScript 6 (Nest CLI), admin en
  React Router 7 (Refine). À relever quand Nest et Refine suivront.
- **`@nestjs/jwt` 11** n'annonce pas NestJS 12 (avertissement de pair
  à l'installation), sans effet constaté.

## PWA — à savoir

- **GPS** (`ecrans/Position.tsx`) : le navigateur ne donne la position
  qu'en HTTPS (ou sur `localhost`). Une PWA ouverte en `http://` sur le
  réseau local (téléphone de test → poste de développement) affiche
  « Localisation refusée ». En production, Caddy sert en HTTPS et autorise
  `geolocation=(self)` (`deploy/Caddyfile`).
- **Coordonnées hors du Mali refusées** (`controlerCoordonnees`, marge
  ~20 km) : une ferme frontalière réelle au-delà de la marge serait
  rejetée. Élargir `EMPRISE_MALI` si le cas se présente.

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
- **Pesée et distribution liées (D27)** : toute modification de
  `apps/pwa/src/db.ts` qui touche l'index `distributions` doit passer par
  un nouveau `this.version(N)`, jamais réécrire la version existante —
  sinon les téléphones déjà installés ne migrent pas. La distribution
  liée à une pesée se retrouve par `db.distributions.where('peseeId')`,
  pas par un champ sur la pesée elle-même.
- **Ration ouverte (D29)** : la ration fixée à la dernière pêche compte
  chaque jour jusqu'à la pêche suivante ou à la clôture. Un cycle laissé
  sans pêche ni clôture accumule de l'aliment fictif (parcours admin :
  un cycle de 2021 resté ouvert affiche 2 276 kg). Garde-fou : l'alerte
  « pesée en retard ». Saisir la clôture, ou une `dateFin` / une
  quantité mesurée, arrête le compte.
- **Distributions sans ration ni quantité** : refusées par la base
  (`distribution_ration_ou_quantite`). Une pesée supprimée laisse ses
  distributions, `peseeId` à `null` : la ration court alors jusqu'à la
  pêche suivante, comme une distribution saisie seule.
- **Admin : même geste, écran séparé (D28)** — `pages/FormulairePesee.tsx`
  fait le même lien pesée+échantillons+aliment que la PWA, mais dans son
  propre composant (pas de partage possible entre Dexie et les hooks
  Refine). Une distribution créée depuis le téléphone et liée à une pesée
  se voit dans l'admin seulement dans la liste plate des distributions
  du cycle, sans rappel visuel de son `peseeId` — seul le formulaire de
  pesée affiche ce lien, pas la liste des distributions.

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

**Aucun** (carte du 26/09/2026, 119 fichiers). `rationnement.ts` a trouvé
son consommateur : `rationConseillee` sert la PWA (`pwa/src/donnees.ts`).

`admin/src/pages/Carte.tsx` n'est importé que **dynamiquement**
(`lazy(() => import('./pages/Carte'))` dans `App.tsx`, pour ne charger
Leaflet qu'à l'ouverture de la carte) : le script le voit depuis qu'il lit
les `import()`. Un fichier chargé autrement (route en chaîne, outil
externe) resterait signalé à tort — vérifier par `grep` avant de supprimer.

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
B4) et, par ricochet, `dates.ts`. `test/geometrie.ts` et
`test/rationnement.ts` couvrent les bornes de palier (`>= poidsMin`,
`< poidsMax`, priorité thermique) et `niveauRemplissage` — étape 2 de
ETAPES.md, faite depuis (cette section datait d'avant).

## Fichiers les plus sollicités

Modifier ces fichiers a le plus d'effets de bord :

| Fichier | Importé par |
|---|---|
| `apps/api/src/auth/garde.ts` | 16 — tous les contrôleurs de l'API |
| `apps/pwa/src/db.ts` | 15 — schéma IndexedDB : toute table change la version Dexie |
| `packages/shared/src/index.ts` | 14 — point d'entrée de `@aqua/shared` |
| `apps/admin/src/i18n.ts` | 12 |
| `apps/api/src/prisma/prisma.service.ts` | 11 |
| `packages/shared/src/types.ts` | 10 — **toute signature change casse partout** |
| `apps/admin/src/description.ts` | 10 — décrit tous les écrans génériques |

## Symboles dupliqués

48 noms exportés par plusieurs fichiers (carte du 27/09/2026, 135
fichiers). **Voulus** pour l'essentiel :

- **Composants shadcn** (`Button`, `Card` et ses parties, `Field` et ses
  parties, `Badge`, `Alert`, `Input`, `NativeSelect`, `Label`,
  `Separator`, `buttonVariants`, `cn`…) : copies identiques entre
  `admin/src/composants/ui/` et `pwa/src/ui/`, comme `index.css`. Deux
  apps, deux bundles, pas de paquet d'interface commun — **modifier les
  deux**. La PWA n'a que ce qu'elle utilise (ni `checkbox`, ni `table`,
  ni `textarea`).
- **Même nom, sens différent** : `Carte` (page carte de l'admin / carte
  de liste de la PWA), `Alerte` (bandeau d'interface / alerte métier de
  `shared`), `Simulation`, `Connexion`, `App`, `Cycle`, `Ferme`, `Pesee`
  (écran contre type). Sans risque tant qu'on importe par chemin.
- **À surveiller** : `Utilisateur` (admin, PWA, API) et `API_URL` (admin,
  PWA, MCP) décrivent la même chose trois fois ; un champ ajouté à l'un
  doit l'être aux autres. `REFERENTIELS` (admin / PWA) et `RESSOURCES`
  (deux services de l'API) listent des ressources qui doivent concorder.

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
- Géographie : découpage complet chargé, mais **les noms de communes du
  fichier sont ceux d'un village chef-lieu** (cercle de Kayes : « DI »,
  « GUEMOU »… et non « Kayes »), en majuscules. Bamako, absent du fichier,
  est ajouté par `bamako.json` comme **district** (`Region.type`), avec
  un cercle technique « Bamako » et des codes **non officiels** (`00`,
  `0001`, `000101xx`) — à remplacer si l’INSTAT en fournit. Les villages
  du fichier ne sont pas chargés.
- Géographie : une ligne retirée par le seed (cercle et communes fictifs de
  l'ancien seed) **ne part pas vers les PWA déjà synchronisées** — la
  synchro géographique ne transporte pas les suppressions.
- `seed.ts` utilise `createMany({ skipDuplicates: true })` : le relancer
  **ne met pas à jour** une ligne existante, il la saute. Corriger une
  valeur du référentiel demande de passer par l'admin ou par SQL.
- `docker-compose.yml` déclare `aqua/aqua` là où le `.env` utilise
  `postgres`/`user`. Les deux divergent — à aligner avant de repasser
  sur Docker.

## Résolu depuis la dernière carte

- Le script de carte résout maintenant le monorepo : alias `@/` par
  paquet, `@aqua/shared` vers `packages/shared/src/index.ts`, `./x.js`
  vers `x.ts` (NodeNext), `import()` dynamiques. L'ancienne carte ne
  couvrait qu'une partie des fichiers ; celle-ci en indexe 119.

- `datasource.url` retiré du schéma, `prisma.config.ts` en place :
  `db:migrate` et `db:seed` fonctionnent.
- La migration initiale manquait ; elle existe et précède désormais
  `contraintes_metier`.
- Le dépôt avait été installé avec `npm` par-dessus pnpm. Nettoyé.
