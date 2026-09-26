# Aqua-Suivi

Suivi technique et économique d'exploitations piscicoles, du bassin jusqu'à la
statistique nationale. Saisie au bord du bassin, sans réseau ; consolidation
par ferme, secteur, région et Direction Nationale.

## Structure

```
apps/
  api/          NestJS 12 + Prisma 7 + PostgreSQL 17
  admin/        React + Refine          (à venir)
  mobile/       React Native + WatermelonDB (à venir)
packages/
  shared/       types, dates, géométrie, rationnement, indicateurs
```

`packages/shared` est le cœur de l'architecture. Toutes les formules métier y
vivent **une seule fois** et tournent à l'identique sur l'API, l'admin et le
téléphone. Sur un mobile natif, elles auraient dû être réécrites dans un second
langage, avec la divergence que cela finit toujours par produire.

## Démarrer

```bash
cp .env.example .env
pnpm install
pnpm db:up          # PostgreSQL 17 dans Docker
pnpm db:migrate     # crée le schéma
pnpm db:seed        # référentiel : espèces, types, aliments, rationnement
pnpm test:shared    # vérifie les formules sur le cas de référence B4
```

Après la première migration, appliquer
`apps/api/prisma/migrations/00000000000000_contraintes_metier/migration.sql` :
il porte les contraintes que le langage de schéma Prisma ne sait pas exprimer,
notamment l'index partiel « un seul cycle ouvert par infrastructure ».

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

Le domaine est presque entièrement en **ajout** : une pêche de contrôle, une
vente, un traitement sont des lignes nouvelles, pas des modifications. Et chaque
enregistrement a en pratique un seul auteur. La synchronisation est donc le cas
le plus simple qui existe — ni CRDT, ni moteur commercial nécessaire.

### Protocole

Conforme à ce qu'attend WatermelonDB.

```
GET  /sync/pull?lastPulledAt=<ms>
  → { changes: { <table>: { created: [...], updated: [...], deleted: [ids] } },
      timestamp: <ms> }

POST /sync/push
  { lastPulledAt: <ms>, changes: { <table>: { created, updated, deleted } } }
```

Trois règles tiennent l'ensemble :

1. **Portée.** Le pull ne renvoie que les fermes auxquelles l'utilisateur a
   accès, via `AccesFerme`. Un encadreur porte ses fermes affectées, un
   pisciculteur la sienne. Les référentiels descendent en lecture seule et ne
   remontent jamais.
2. **Conflits.** Dernière écriture gagne, comparaison sur `updatedAt`. Mais
   rien ne disparaît en silence : la valeur écartée part dans `ConflitSync`,
   consultable depuis le back-office. Sur un système qui alimente une
   statistique nationale, une donnée perdue sans trace est inacceptable.
3. **Suppressions.** Jamais physiques. `deletedAt` est renseigné et `updatedAt`
   bumpé, donc le pull suivant emporte la suppression.

### Le cas qui va se produire

Deux appareils ouvrent hors ligne un cycle sur le même bassin. L'index partiel
`cycles_un_seul_ouvert_par_infrastructure` rejette le second à la
synchronisation. **C'est le comportement voulu** : c'est une vraie erreur de
terrain — deux personnes ont chargé le même bassin — et elle doit remonter à
l'agent, pas être absorbée par le code.

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
