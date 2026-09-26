# Architecture — Aqua-Suivi

Suivi de cycles piscicoles au Mali. Deux profils saisissent : le
pisciculteur sur ses bassins, l'agent d'encadrement sur les fermes qui
lui sont affectées. Terrain sans réseau → **hors-ligne d'abord**.

## Stack

| Couche | Choix | Pourquoi |
|---|---|---|
| Monorepo | pnpm workspaces | un seul `pnpm install`, types partagés sans publication. **Jamais `npm`** : il aplatit et casse l'isolation |
| API | NestJS 12 + Prisma 7 | référentiels, géographie, saisie, indicateurs, **authentification JWT** (D18), **synchronisation** (D21) |
| Base | PostgreSQL 17 | index partiels + contraintes `CHECK` (voir DOMAINE.md) |
| Calculs | `@aqua/shared` (TS pur) | **une seule** implémentation pour API, admin, mobile |
| Admin | React 19 + Refine 5 + Vite 8 + Tailwind v4 | référentiels **et** saisie de terrain ; shadcn/ui + Radix, thème vert (D24) ; carte Leaflet/OSM (D25) |
| Mobile | **PWA** React 19 + Vite 8 + IndexedDB (Dexie) + Workbox | `apps/pwa`, hors ligne d'abord, installable chez un particulier (D19) |
| MCP | SDK officiel, transport stdio | lecture seule — interroger et analyser |

## Découpage

```
aquasuivi/
├── packages/shared/        ← TOUT le calcul métier. Aucun ORM, aucun I/O.
│   ├── src/types.ts            contrats de domaine (découplés de Prisma)
│   ├── src/dates.ts            dates de terrain « AAAA-MM-JJ », sans fuseau
│   ├── src/geometrie.ts        surface / volume en eau
│   ├── src/rationnement.ts     palier de ration (espèce × poids × température)
│   ├── src/indicateurs.ts      ← COEUR : zootechnie + économie d'un cycle
│   └── test/b4.ts              16 assertions sur un cycle réel (Kotouba B4)
├── apps/api/
│   ├── prisma.config.ts        ← à la racine de apps/api, pas dans prisma/
│   ├── prisma/
│   │   ├── schema.prisma           25 modèles, ULID, soft-delete
│   │   ├── migrations/…_init/      création des tables
│   │   ├── migrations/…_contraintes_metier/  hors langage Prisma, APRÈS init
│   │   └── seed.ts                 8 espèces, 12 types, 8 aliments…
│   └── src/
│       ├── prisma/             PrismaService : adaptateur pg + filtre deletedAt
│       ├── common/             domaine.ts : Decimal → number, dates de terrain
│       │                       prisma-exception : contraintes SQL → erreurs métier
│       ├── referentiels/       CRUD des 5 référentiels
│       ├── saisie/             CRUD des 12 tables de terrain + règles dérivées
│       ├── cycles/             agrégat → calculerIndicateurs
│       └── geographie/         lecture seule
├── apps/admin/src/
│   ├── description.ts          ← types Champ et Ressource, socle des écrans
│   ├── referentiels.ts         ← les 5 référentiels administrés
│   ├── saisie.ts               ← les 12 tables de terrain, hiérarchisées
│   ├── i18n.ts                 ← tous les libellés et formats, fr + XOF
│   ├── index.css               ← jetons de couleur, clair et sombre
│   ├── composants/ui/          ← composants shadcn/ui (Radix), dans le dépôt
│   └── pages/                  liste et formulaire génériques
├── apps/pwa/src/               ← application de terrain, hors ligne (D19)
│   ├── db.ts                   base IndexedDB (Dexie) + journal des envois
│   ├── saisie.ts               écriture locale + contrôles partagés + journal
│   ├── sync.ts                 push puis pull (D21), relances
│   ├── donnees.ts              agrégat local → calculerIndicateurs, ration
│   ├── formulaires.ts          description des formulaires de terrain
│   └── ecrans/                 connexion, fermes, cycle, pesée, corrections
├── apps/mcp/src/               serveur MCP, lecture seule
└── apps/e2e/test/              parcours : cycle B4, MCP, navigateur
```

`packages/shared` est **compilé** vers `dist/` (script `prepare`) : l'API
est en `NodeNext` et ne sait pas charger du TypeScript brut.

## Points d'entrée

- **Calcul d'un cycle** → `calculerIndicateurs(d: CycleComplet)`
  dans `packages/shared/src/indicateurs.ts:42`. Fonction pure : on lui
  passe l'agrégat complet, elle ne lit rien.
- **Vérification** → `pnpm test:shared` (exécute `test/b4.ts`).
- **Base** → `pnpm db:migrate && pnpm db:seed`. (`db:up` suppose Docker,
  écarté pour l'instant : la base tourne sur le PostgreSQL natif.)
- **Lancer** → `pnpm dev:api` (port 3000) puis `pnpm dev:admin` (5173).
- **Serveur MCP** → `pnpm mcp` (l'API doit tourner). Voir `modules/mcp.md`.
- **Parcours complet en navigateur** → `pnpm test:e2e`, les deux serveurs
  étant lancés. Sans Playwright : Chrome/Edge sont déjà là et Node ≥ 22
  a un `WebSocket` natif. Voir `modules/e2e.md`.

  Ce niveau n'est pas cosmétique : **trois défauts d'affichage sont
  passés au travers du typecheck et du build** et n'apparaissaient qu'à
  l'usage réel — voir `modules/admin.md`.

  Pour un simple coup d'œil sans écrire de test :
  `chrome.exe --headless=new --user-data-dir=<profil jetable>
  --virtual-time-budget=10000 --dump-dom <url>` (ou `--screenshot=`).

## Règle de dépendance

`shared` ne dépend de **rien** (ni Prisma, ni WatermelonDB, ni Node).
C'est ce qui permet au même code de tourner sur le serveur et dans le
téléphone. Toute importation d'ORM dans `packages/shared/` est une
régression : les formules divergeraient entre mobile et serveur.

Sens des flèches : `api → shared`, `mobile → shared`, `admin → shared`.
Jamais l'inverse.

## Identifiants et synchronisation

Clés primaires **ULID générés par le client**. Deux téléphones hors
réseau doivent pouvoir créer des lignes sans collision ; le
`@default(ulid())` du schéma ne sert qu'aux lignes nées côté serveur.

Résolution de conflit : **dernière écriture gagne**, mais la valeur
écartée est journalisée dans `ConflitSync` — rien n'est perdu
silencieusement.

Toutes les tables de saisie portent `updatedAt` **indexé** : le pull de
synchronisation filtre dessus.

## État réel

Écrit et couvert par des tests : `packages/shared`, la base, l'API
(référentiels, saisie, indicateurs), l'admin des référentiels, le
serveur MCP. `pnpm test:shared` puis `pnpm test:e2e`.

Non écrit :
consolidation territoriale. Voir `ETAPES.md`.

L'API est **fermée par défaut** (`GardeJwt` global, `@Publique()` pour
ouvrir une route) et chaque ressource de saisie est bornée aux fermes de
l'utilisateur (`auth/portee.ts`, `VERS_FERME` dans `saisie.config.ts`).
Ce qui reste à durcir est listé dans `ALERTES.md`.
