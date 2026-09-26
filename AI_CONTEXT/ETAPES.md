# Étapes

État au 2026-09-25. Chaque étape a un critère de fin **vérifiable** :
une commande qui passe, pas une impression d'avoir fini.

Légende : `[x]` fait · `[~]` partiel · `[ ]` à faire

---

## Étape 0 — Débloquer Prisma 7 `[x]`

- [x] Retirer `url = env("DATABASE_URL")` de `schema.prisma`
- [x] Créer `apps/api/prisma.config.ts` — **à la racine de `apps/api/`,
      pas dans `prisma/`** : ailleurs, Prisma ne le découvre pas et
      `migrate` réclame `--config` à chaque appel
- [x] `@prisma/adapter-pg`, `pg`, `@prisma/config` dans `apps/api`
- [x] Adaptateur branché dans `seed.ts` et dans `PrismaService`
- [ ] Docker Desktop — **écarté pour le moment** : la base tourne sur le
      PostgreSQL natif de la machine (service `postgresql-x64-18`). Voir
      la note « Base de développement » plus bas.

**Fin :** `pnpm db:migrate && pnpm db:seed` s'enchaînent sans erreur. ✅

### Ce que cette étape a révélé

Le déblocage a mis au jour trois pannes que la carte ne prévoyait pas :

1. **Le monorepo avait été installé avec `npm`** (un `package-lock.json`
   à la racine, `@prisma/adapter-pg` en dépendance du paquet racine).
   npm aplatit, pnpm isole : `@aqua/api` ne voyait donc ni l'adaptateur
   ni `pg`. Corrigé — dépendances redescendues dans `apps/api`.
2. **`seed.ts` ne correspondait plus au schéma** : `code_fao` au lieu de
   `codeFao`, un `code_asfis` inexistant, tout le bloc
   `TypeInfrastructure` écrit avec des énumérations d'une version
   antérieure (`RECTANGULAR`, `CONTINENTAL`, `PONDS`…), `code` requis
   absent, `delaiAttenteFoieJours` et `notes` inexistants. `apps/api` ne
   typecheckait pas `prisma/` — c'est réparé
   (`tsconfig.typecheck.json`), et c'est ce qui aurait signalé les huit
   erreurs d'un coup.
3. **Il manquait la migration initiale.** `00000000000000_contraintes_metier`
   ajoute des contraintes à des tables que rien ne créait — son propre
   en-tête dit « à exécuter après `prisma migrate dev` ». Les deux
   migrations sont désormais ordonnées : `…_init` puis `…_contraintes_metier`.

### Base de développement

Docker est écarté pour l'instant. La base tourne sur le PostgreSQL natif
(`localhost:5432`, base `aquasuivi`). Attention : `docker-compose.yml`
déclare `aqua/aqua` alors que le `.env` utilise `postgres`/`user` — les
deux divergent, à aligner le jour où l'on repasse sur Docker.

---

## Étape 1 — Socle de calcul `[x]`

- [x] `types.ts`, `dates.ts`, `geometrie.ts`, `rationnement.ts`,
      `indicateurs.ts`
- [x] `test/b4.ts` — 16 assertions sur le cycle réel Kotouba B4
      (1 584 F/kg de revient, 1 750 F/kg de vente, 54 700 F de résultat,
      10,46 % de rentabilité)

**Fin :** `pnpm test:shared` affiche `TOUS LES CONTROLES PASSENT`. ✅

---

## Étape 2 — Combler les trous du socle `[~]`

Avant d'écrire l'API, parce que l'API va s'appuyer dessus.

- [x] Tests de `geometrie.ts` : circulaire, rectangulaire, dimensions
      manquantes, `niveauRemplissage` à 80 % et à 0 — `test/geometrie.ts`.
      Fige un choix : le volume part de la superficie **arrondie** (celle
      qui est stockée), d'où 12,07 m³ et non 12,06 pour Ø 4 m × 1,2 m à 80 %
- [x] Tests de `rationnement.ts` : bornes `>= poidsMin` / `< poidsMax`,
      priorité du palier thermique sur le générique quel que soit l'ordre,
      0 °C distinct d'« absente », absence de palier — `test/rationnement.ts`
- [x] Seuil de coefficient de variation : par espèce, 25 % par défaut (D22)

**Fin :** `pnpm test:shared` couvre les trois modules de calcul. ✅
(`b4.ts && geometrie.ts && rationnement.ts`), et depuis D20 les contrôles
de saisie (`controles.ts`), vérifiés aussi par l'API dans
`pnpm --filter @aqua/e2e test:controles`.

---

## Étape 3 — Base exécutable et référentiels

- [x] `schema.prisma` — 25 modèles
- [x] `migration.sql` — contraintes hors langage Prisma
- [x] `seed.ts` — 8 espèces, 12 types d'infrastructure, 8 aliments,
      5 produits sanitaires, paliers tilapia + clarias
- [ ] Confirmer les **délais d'attente sanitaires** auprès du service
      vétérinaire (`seed.ts:89-91` — places tenues, règle de sécurité
      alimentaire)
- [ ] Renseigner les codes ASFIS des 7 espèces sans `codeFao`
- [x] Charger la géographie complète du Mali — `prisma/data/decoupage_mali.json`
      (19 régions, 157 cercles, 792 communes, codes officiels) + district de
      Bamako (`bamako.json`, `Region.type = DISTRICT`, cercle technique
      « Bamako » choisi d’office dans les formulaires, codes « 00… » maison) ; listes Région → Cercle →
      Commune en cascade (admin `dependDe`, PWA `dependDe`) et cohérence
      contrôlée à l’écriture d’une ferme (`RATTACHEMENT_INCOHERENT`) ; villages
      du fichier non chargés, `Ferme.village` reste un texte

**Fin :** la migration applique les 6 contraintes SQL, et une tentative
d'ouvrir deux cycles sur le même bassin est rejetée par la base.

---

## Étape 4 — API NestJS `[x]`

- [x] `PrismaService` avec l'adaptateur `pg` — `src/prisma/prisma.service.ts`
- [x] Extension Prisma qui filtre `deletedAt: null` par défaut
      (décision D12 — le répéter à la main garantit un oubli)
- [x] Adaptateur `Prisma.Decimal → number` à la frontière du domaine
      (voir ALERTES.md : sans lui, les additions concatènent des chaînes)
- [x] CRUD des **référentiels** + géographie en lecture —
      `src/referentiels/`, `src/geographie/` (fait pour débloquer l'étape 6)
- [x] Contraintes SQL remontées en erreurs métier lisibles plutôt qu'en
      500, avec un **code stable** pour l'interface anglaise —
      `src/common/prisma-exception.filter.ts`
- [x] **Câbler `dimensionsCalculees()` à l'écriture d'une
      `Infrastructure`** — `src/saisie/saisie.service.ts`. C'était le trou
      signalé dans ALERTES.md : sans lui, densité et rendement valaient `null`
- [x] `finDelaiAttente` déduit du produit sanitaire à l'écriture d'un
      traitement — sans quoi aucune récolte n'est jamais signalée non conforme
- [x] Conversion des dates de terrain aux deux sens (`src/common/domaine.ts`) :
      « AAAA-MM-JJ » en entrée comme en sortie, jamais d'horodatage
- [x] CRUD : fermes, infrastructures, cycles, lots, mortalités, pesées,
      échantillons, distributions, traitements, récoltes, dépenses,
      mesures d'eau — `src/saisie/`
- [x] `GET /cycles/:id/indicateurs` → `calculerIndicateurs`
- [x] Authentification JWT + garde sur `AccesFerme` (D18) — `src/auth/` :
      inscription libre par téléphone, connexion, rafraîchissement
      tournant, déconnexion par appareil ; toute ressource de saisie
      bornée aux fermes de l'utilisateur, référentiels en écriture pour
      `ADMIN` seul. Vérifié par `pnpm --filter @aqua/e2e test:auth`

**Fin :** rejouer le cycle B4 **via l'API** donne les mêmes 16 chiffres
que `test/b4.ts`. ✅ `pnpm --filter @aqua/e2e test:cycle` — c'est ce test
qui prouve que l'adaptation `Decimal` **et** la conversion des dates de
terrain sont correctes.

Le premier administrateur vient de `pnpm db:seed`
(`AQUA_ADMIN_TELEPHONE` / `AQUA_ADMIN_MOT_DE_PASSE`).

---

## Étape 5 — Synchronisation `[x]` (D21)

Le cœur du projet. À traiter comme un sujet à part entière, pas comme
deux routes. — `apps/api/src/sync/`

- [x] `GET /sync/pull?depuis=…&appareilId=…` — delta sur les fermes
      lisibles, suppressions incluses, référentiels et géographie avec ;
      une ferme confiée après le dernier pull arrive en entier
- [x] `POST /sync/push` — dernière écriture gagne, écriture systématique
      dans `ConflitSync` quand une valeur est écartée
- [x] L'échec « cycle déjà ouvert » (D7) revient comme
      `CYCLE_DEJA_OUVERT` **sur la ligne concernée**, sans bloquer le lot ;
      de même pour tout contrôle de saisie (D20)
- [x] `derniereSyncAt` noté sur l'appareil (enregistré à la connexion, D18)
- [x] Test : deux clients simulés modifient la même ligne hors ligne →
      un gagne, `ConflitSync` contient exactement une ligne

**Fin :** le scénario à deux clients passe en test automatisé. ✅
`pnpm --filter @aqua/e2e test:sync` (33 contrôles).

**Reste :** écran de consultation des conflits (étape 6), et le client
de synchronisation lui-même, côté PWA (étape 7).

---

## Étape 6 — Admin React/Refine `[x]`

- [x] Administration des référentiels (espèces, types, aliments,
      produits, paliers) — `apps/admin`, écrans engendrés depuis
      `src/referentiels.ts`
- [x] **Écrans de saisie** : ferme → infrastructure → cycle, et les sept
      sections d'un cycle (lots, pesées, distributions, traitements,
      récoltes, dépenses, qualité de l'eau) — `src/saisie.ts`
- [x] **Fiche cycle avec les indicateurs** — `pages/FicheCycle.tsx`
- [x] Écran de connexion — `pages/Connexion.tsx`, session dans
      `src/session.ts` (rafraîchissement silencieux, un seul à la fois)
- [x] Gestion des utilisateurs et des `AccesFerme` — `/admin/utilisateurs`,
      `/admin/acces` (rôle ADMIN), écrans génériques `src/administration.ts` ;
      désactivation et changement de mot de passe coupent les sessions
- [x] Écran de consultation des conflits (`ConflitSync`) — valeur écartée
      contre valeur retenue, champ par champ ; « traité » / « rouvrir »
- [x] Consolidation par commune / cercle / région — `GET /consolidation`,
      chaque cycle chiffré par `calculerIndicateurs`, dans le périmètre lisible
- [x] Simulation (étape 9) et alertes en cours (étape 8) dans l'admin

`pnpm --filter @aqua/e2e test:administration` (29 contrôles).

**Fin :** un administrateur crée une espèce et un palier sans toucher à
la base. ✅ — et au-delà : `pnpm --filter @aqua/e2e test:saisie` crée en
navigateur une ferme, un bassin, un cycle et un lot, puis vérifie que les
indicateurs s'affichent.

> Prise en ordre inverse du graphe de dépendances : l'admin avait besoin
> d'une API, donc la tranche « référentiels » de l'étape 4 a été écrite
> avec. Le reste de l'étape 4 (cycles, indicateurs, authentification)
> reste devant.

---

## Étape 7 — PWA mobile (D19) `[x]` — `apps/pwa`

- [x] Application installable : manifeste, icônes 192/512
      (`scripts/icones.mjs`), service worker Workbox qui sert l'interface
      hors ligne — **jamais l'API**
- [x] Inscription et connexion depuis le téléphone
- [x] Base locale IndexedDB (Dexie) miroir des tables de saisie, ULID
      générés localement ; session et jeton de rafraîchissement dedans
- [x] Saisie hors ligne : ferme, bassin, cycle (ouverture, clôture),
      alevins, pêche de contrôle avec échantillons, mortalité, aliment,
      traitement, récolte, dépense, qualité de l'eau — avec les **mêmes
      contrôles** que l'API (D20), contexte lu dans IndexedDB
- [x] Indicateurs calculés sur le téléphone (`calculerIndicateurs`) et
      ration du jour via `rationConseillee()`
- [x] File de synchronisation (`journal`), une entrée par ligne, reprise
      après coupure, relances espacées quand le réseau ment
      (`navigator.onLine` vrai sans internet), écran « À corriger » pour
      les refus du serveur
- [x] Les deux profils : l'encadreur reçoit les fermes qui lui sont
      confiées par la synchronisation (D21)

**Fin :** un cycle complet saisi en mode avion, synchronisé au retour du
réseau, donne les mêmes indicateurs que la saisie directe. ✅
`pnpm --filter @aqua/e2e test:pwa` (21 contrôles, navigateur réel, build
de production, mode avion simulé), après `pnpm build:pwa && pnpm preview:pwa`.

**Reste :** notifications (rappel de pesée), photo de la balance, saisie
vocale — rien de cela n'est commencé.

---

## Étape 8 — Moteur d'alertes `[x]` (D22)

`packages/shared/src/alertes.ts`, appelé par l'API, l'admin (via l'API) et
la PWA (localement, hors ligne).

- [x] Densité au-dessus de `densiteMaxM2` / `densiteMaxM3`
- [x] Température hors `temperatureOptMin/Max` (attention) ou hors
      `temperatureMin/Max` (critique), oxygène sous `oxygeneMin`, pH
- [x] Croissance sous la référence de l'espèce (`performance < 1`)
- [x] Coefficient de variation au-dessus du seuil — **tranché** : champ
      `seuilHeterogeneitePct` de l'espèce, 25 % par défaut
- [x] **Récolte dans le délai d'attente** en alerte critique, traitement
      en cours en information
- [x] En plus : mortalité anormale, aliment mal valorisé, pesée en retard
- [x] `GET /cycles/:id/alertes`, `GET /alertes` (tableau de bord), outil
      MCP `alertes_en_cours`

**Fin :** un cycle surdensifié déclenche une alerte visible sur mobile
et dans l'admin. ✅ `pnpm --filter @aqua/e2e test:alertes`.

---

## Étape 9 — Simulation `[x]` (D23)

`packages/shared/src/simulation.ts` ; API `apps/api/src/simulations/`,
page Simulation de l'admin, écran « Simuler un projet » de la PWA (hors ligne).

- [x] À partir d'un capital, d'une espèce, d'un type d'infrastructure et
      d'une surface : production, charges, prix de revient, seuil de
      rentabilité (prix et quantité), besoin de financement, taille
      finançable, résultat annuel
- [x] Réutilise `calculerIndicateurs` sur un **cycle projeté** construit
      depuis les repères de l'espèce (D13)
- [x] Simulations enregistrées par leur auteur (`Simulation`)

**Fin :** une simulation et un cycle réel comparables passent par le
même code. ✅ `packages/shared/test/simulation.ts` rejoue le cycle projeté
dans `calculerIndicateurs` ; `pnpm --filter @aqua/e2e test:simulation`
vérifie qu'API, admin et PWA hors ligne donnent le même résultat.

---

## Étape 10 — Mise en ligne `[~]` — `deploy/`

- [x] Sécurité : CORS limité aux domaines (`AQUA_ORIGINES`), limite des
      tentatives de connexion et d'inscription, adresse réelle derrière le
      proxy (`AQUA_DERRIERE_PROXY`)
- [x] Docker Compose : PostgreSQL non exposé, API qui migre au démarrage,
      Caddy (HTTPS Let's Encrypt, en-têtes de sécurité, politique de
      contenu stricte, service worker jamais mis en cache)
- [x] Sauvegarde quotidienne (`deploy/sauvegarder.sh`) et procédure
      (`deploy/README.md`)
- [ ] **Premier déploiement réel** : les images n'ont pas été construites
      ici (Docker Desktop écarté sur la machine de développement) — voir
      ALERTES.md

**Fin :** `https://terrain.…` s'installe sur un téléphone Android et
synchronise avec `https://api.…`.

---

## Étape 11 — Interface : shadcn, Radix, thème vert, carte `[~]` (D24–D26)

- [x] Dernières versions : React 19, Vite 8, TypeScript 7 (API en 6),
      Refine 5, React Router 8 (7 dans l'admin) — D26
- [x] `components.json` (admin, PWA) : `pnpm dlx shadcn@latest add …`
- [x] Radix : `Checkbox`, `Label`, `Button asChild` ; `select` natif gardé
- [x] Thème vert `--vert-50` … `--vert-950`, clair et sombre, admin = PWA
- [x] Carte `/carte` (admin) : Leaflet + OpenStreetMap, points colorés
      par alertes, fermes sans coordonnées listées ; CSP de Caddy ouverte
      à `tile.openstreetmap.org`
- [ ] Saisir latitude / longitude en cliquant sur la carte (fiche ferme)
- [ ] PWA : « utiliser ma position » (GPS) à la création d'une ferme
- [ ] Carte hors ligne : tuiles auto-hébergées (PMTiles du Mali), D25

---

## Ordre et dépendances

```
0 (bloquant)
├── 2  socle complété        ─┐
└── 3  base + référentiels   ─┴→ 4 API ─→ 5 sync ─┬→ 6 admin
                                                  └→ 7 mobile
                                     4 ─→ 8 alertes
                                     4 ─→ 9 simulation
```

Les étapes 2 et 3 sont indépendantes l'une de l'autre et peuvent être
menées en parallèle. 6 et 7 aussi, une fois 5 terminée.
