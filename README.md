# Aqua-Suivi

Suivi technique et économique d'exploitations piscicoles, du bassin jusqu'à la
statistique nationale. Saisie au bord du bassin, sans réseau ; consolidation
par ferme, secteur, région et Direction Nationale.

## Structure

```
apps/
  api/          NestJS 12 + Prisma 7 + PostgreSQL 17 — auth JWT, saisie, sync, alertes
  admin/        React + Refine + Tailwind — référentiels, saisie, administration
  pwa/          application de terrain installable, hors ligne (IndexedDB)
  mcp/          serveur MCP en lecture seule, pour interroger les données
  e2e/          parcours de bout en bout (API, navigateur réel, mode avion)
packages/
  shared/       types, dates, géométrie, rationnement, indicateurs,
                contrôles de saisie, alertes, simulation
deploy/         mise en ligne : Docker Compose + Caddy (HTTPS automatique)
AI_CONTEXT/     architecture, décisions (D1…D23), étapes, points d'attention
```

`packages/shared` est le cœur de l'architecture. Toutes les formules métier y
vivent **une seule fois** et tournent à l'identique sur l'API, l'admin et le
téléphone — y compris hors ligne : indicateurs, contrôles de saisie, alertes
et simulation d'un projet.

## Démarrer

```bash
cp .env.example .env      # puis générer JWT_SECRET, choisir le compte admin
pnpm install
pnpm db:migrate           # schéma + contraintes métier (PostgreSQL local ou `pnpm db:up`)
pnpm db:seed              # référentiels + premier administrateur
pnpm dev:api              # http://localhost:3000/api
pnpm dev:admin            # http://localhost:5173
pnpm dev:pwa              # http://localhost:5180 — l'application de terrain
```

Pour remplir l'admin et la PWA de données de démonstration (API démarrée) :

```bash
pnpm db:donnees-test      # 6 fermes « [TEST] », 10 cycles, 4 comptes (mot de passe test-aqua-2026)
pnpm db:donnees-test -- --effacer   # les retire
```

Rejouable, il efface d'abord son passage précédent. **Jamais en production.**

Un particulier crée son compte depuis l'application de terrain, avec son
numéro de téléphone ; les rôles d'encadrement se donnent dans l'admin.

## Tests

```bash
pnpm test:shared          # formules : cycle B4, géométrie, ration, contrôles, alertes, simulation
pnpm test:e2e             # API, admin et PWA démarrées ; PWA en build de production :
                          #   pnpm build:pwa && pnpm preview:pwa
```

Les parcours e2e se lancent aussi un par un (`pnpm --filter @aqua/e2e
test:sync`, `test:pwa`, …) ; ils écrivent dans la base de développement et
nettoient derrière eux.

## Mise en ligne

Voir [deploy/README.md](deploy/README.md) : un serveur, trois sous-domaines,
`docker compose up`. HTTPS est obligatoire pour installer l'application sur
un téléphone.

## Modèle de données

L'unité de gestion est le **cycle** : de la mise en charge à la vidange d'une
infrastructure. Tout s'y rattache, et le nombre d'événements par cycle est libre —
c'est la différence de fond avec le tableur d'origine, où une pêche de contrôle
supplémentaire demandait d'ajouter des colonnes.

```
Ferme ──< Infrastructure ──< Cycle ──< Lot ──< Mortalité
                                  │        └─< Échantillon
                                  ├──< Pesée ──< Échantillon
                                  ├──< Distribution
                                  ├──< Traitement
                                  ├──< Récolte
                                  ├──< Dépense
                                  └──< MesureEau
```

Un **lot** = une espèce mise en charge. Plusieurs lots par cycle rendent la
polyculture tilapia-clarias possible, ce que le modèle précédent interdisait.

Les **référentiels** — espèces, types d'infrastructure, aliments, produits
sanitaires, paliers de rationnement — sont administrés depuis le back-office.
Rien n'est codé en dur : une treizième forme de bassin ou une neuvième espèce
s'ajoute par formulaire, sans migration ni développeur.

## Identifiants : ULID générés par le client

C'est la condition du hors-ligne. Deux téléphones sans réseau doivent pouvoir
créer des enregistrements sans collision, donc l'identifiant naît sur
l'appareil, pas dans la base. Le `@default(ulid())` du schéma ne sert qu'aux
lignes créées côté serveur.

Les ULID se trient par ordre chronologique, ce qui préserve la localité
d'index — avantage réel sur un UUID v4 quand les tables grossissent.

## Synchronisation

Le téléphone saisit dans sa base locale, puis synchronise dès qu'il a du
réseau (décision D21 dans `AI_CONTEXT/DECISIONS.md`).

```
GET  /sync/pull?depuis=<curseur>&appareilId=<ulid>
  → { curseur, saisie: { <table>: { modifies: [...], supprimes: [ids] } },
      referentiels, geographie }

POST /sync/push
  { appareilId, changements: [ { ressource, id, operation, donnees,
                                 versionBase, modifieLe } ] }
  → { resultats: [ { statut: applique | conflit | rejete, gagnant?, code? } ] }
```

1. **Portée.** Le pull ne renvoie que les fermes lisibles par l'utilisateur
   (`AccesFerme`, région pour les profils territoriaux). Une ferme confiée
   après le dernier pull arrive en entier.
2. **Conflits.** Détectés par version (`versionBase`), tranchés par la
   modification la plus récente — l'heure du téléphone bornée à celle du
   serveur. La valeur écartée part dans `ConflitSync`, consultable dans
   l'admin : aucune donnée ne disparaît en silence.
3. **Refus ligne par ligne.** Chaque changement passe par les mêmes droits
   et contrôles que la saisie en ligne ; un refus (`CYCLE_DEJA_OUVERT`,
   date hors du cycle…) revient sur sa ligne, sans bloquer le reste, et
   s'affiche dans l'écran « À corriger » du téléphone.
4. **Suppressions.** Jamais physiques : `deletedAt`, propagé aux enfants.

### Le cas qui va se produire

Deux appareils ouvrent hors ligne un cycle sur le même bassin. Le second est
refusé à la synchronisation (`CYCLE_DEJA_OUVERT`). **C'est le comportement
voulu** : c'est une vraie erreur de terrain — deux personnes ont chargé le
même bassin — et elle doit remonter à l'agent, pas être absorbée par le code.

## Dates

Les dates de terrain sont des chaînes `AAAA-MM-JJ`, sans heure ni fuseau. Une
pêche de contrôle a lieu un jour, pas à un instant. Les manipuler comme des
objets `Date` introduit des décalages de fuseau qui font glisser une saisie au
jour précédent — un bug silencieux et pénible à diagnostiquer.

Chaque événement porte **deux** dates : `dateOperation`, le jour du terrain, et
`createdAt`, le moment de la saisie. L'écart entre les deux mesure la fraîcheur
des données d'un agent — un indicateur de suivi en soi.

## Indicateurs

`packages/shared/src/indicateurs.ts` produit le jeu complet à partir d'un cycle :

| Domaine | Indicateurs |
| --- | --- |
| Zootechnie | taux de survie, poids moyen, GMQ, **TCS**, coefficient de variation |
| Production | biomasse, production nette, densité, charge finale, rendement t/ha/an |
| Alimentation | aliment distribué, **indice de consommation**, coût par kg produit |
| Économie | charges détaillées, produits, prix de revient, marge, rentabilité |
| Conformité | fin de délai d'attente, récoltes non conformes |

Deux choix de méthode méritent d'être connus :

- L'**indice de consommation** est rapporté à la production *nette*, comme le
  veut sa définition. Le rapporter au poids récolté brut flatte le résultat en
  créditant l'élevage du poids des alevins mis en charge.
- **Dons et autoconsommation sont valorisés** au prix de vente. Sans cela, un
  pisciculteur qui nourrit sa famille apparaîtrait en perte alors qu'il produit
  de la valeur — une distorsion qui fausserait l'évaluation de la contribution
  de la pisciculture à l'économie des ménages.

Une réserve à porter à l'affichage : le **rendement annualisé en t/ha/an** est
arithmétiquement juste, mais extrapoler un bassin béton de 100 m² à l'hectare
donne un chiffre qui n'est pas comparable à celui d'un étang en terre.

### Corrections par rapport à la version précédente

Trois erreurs de calcul ont été corrigées au portage. Aucune ne provoquait
d'erreur à l'exécution — elles produisaient des résultats faux mais plausibles,
ce qui les rendait coûteuses dans un outil d'aide à la décision.

1. **Coût des alevins de remplacement** : on somme les produits ligne à ligne.
   L'ancien calcul multipliait la somme des remplacements par la somme des prix
   unitaires ; avec trois pesées à 110 F, le remplacement était facturé 330 F
   l'alevin, et l'erreur croissait avec la durée du cycle.
2. **Production retenue** : la récolte pesée fait foi. L'ancien rapport
   renvoyait la biomasse estimée à la dernière pêche et ignorait les ventes.
3. **Divisions** toutes protégées.

`pnpm test:shared` verrouille ces corrections sur le cycle B4 de la ferme
Kotouba — seize valeurs vérifiées, dont un prix de revient de 1 584 F/kg contre
un prix de vente de 1 750 F.

## À compléter avant mise en production

- Codes ASFIS des sept espèces autres que le tilapia du Nil. Ils sont laissés
  vides plutôt que devinés : un code faux agrégerait la production nationale
  sous la mauvaise espèce.
- Délais d'attente des produits sanitaires, à confirmer auprès du service
  vétérinaire compétent. Les valeurs du seed sont des places tenues.
- Découpage administratif complet du Mali, depuis une source officielle. Seul
  le périmètre pilote (Sikasso / Sikasso / Finkolo) est amorcé — le découpage
  a été remanié et ne doit pas être saisi de mémoire.
- Paramètres zootechniques du clarias et des espèces secondaires, à valider
  avec la Direction Nationale des Pêches, dont les recommandations primeraient
  sur les références internationales.
