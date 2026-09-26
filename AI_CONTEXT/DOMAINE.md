# Domaine — règles métier

`[CONFIRMÉ]` = lu dans le code, avec fichier:ligne réouvrable.
`[DÉDUIT]` = probable, non vérifié — à confirmer avant de s'en servir.

## Unités — invariant global

- `[CONFIRMÉ]` Poids d'un poisson en **grammes**, biomasse et aliment en
  **kilogrammes**, montants en **F CFA entiers**, dates en chaînes
  `AAAA-MM-JJ`. `packages/shared/src/types.ts:8-16`
- `[CONFIRMÉ]` Le F CFA n'a pas de subdivision en usage : tout montant
  passe par `francs()` qui arrondit à l'entier.
  `packages/shared/src/indicateurs.ts:28`
- `[CONFIRMÉ]` Les dates de terrain ne sont **jamais** des objets `Date`.
  Une pêche a lieu un jour, pas à un instant ; manipuler ces dates comme
  des `Date` fait glisser une saisie au jour précédent selon le fuseau.
  L'ordre lexicographique ISO est l'ordre chronologique.
  `packages/shared/src/dates.ts:1-7`, `dates.ts:28`

## Effectifs et survie

- `[CONFIRMÉ]` Effectif d'un lot = `nombre − mortalités + remplacements`,
  plancher à 0. `indicateurs.ts:57`
- `[CONFIRMÉ]` Taux de survie rapporté à `effectifInitial +
  remplacements`, pas au seul effectif initial — sinon un remplacement
  massif ferait dépasser 100 %. `indicateurs.ts:88-89`

## Croissance

- `[CONFIRMÉ]` Poids moyen d'un lot = celui de la **dernière pesée où ce
  lot a été échantillonné**. En monoculture (`lots.length === 1`), un
  échantillon sans `lotId` est rattaché au lot unique.
  `indicateurs.ts:61-68`
- `[CONFIRMÉ]` **La récolte prime sur l'estimation.** Si des récoltes
  portent un `nombre`, le poids moyen final vient d'elles ; sinon
  seulement, on retombe sur la biomasse estimée à la dernière pesée.
  Des poissons pesés et comptés à la vente sont une mesure.
  `indicateurs.ts:97-108`
- `[CONFIRMÉ]` TCS = `(ln(Pf) − ln(Pi)) / jours × 100`, en %/jour. Seul
  indicateur qui rende comparables un alevin de 20 g et un adulte de
  300 g. `indicateurs.ts:126-129`
- `[CONFIRMÉ]` Coefficient de variation calculé sur les échantillons de
  la **dernière pesée**, variance d'échantillon (`n−1`), minimum 2
  échantillons. `indicateurs.ts:137-149`
- `[DÉDUIT]` Seuil d'alerte du CV ≈ **25 %** : au-delà le lot est
  hétérogène, il faut envisager un tri ; chez le clarias c'est un signal
  précoce de cannibalisme. Commentaire `indicateurs.ts:131-136` — **le
  seuil n'est implémenté nulle part**, aucune alerte n'est levée.

## Date de fin d'un cycle

- `[CONFIRMÉ]` Cascade : `dateCloture` → sinon récolte la plus tardive →
  sinon dernière pesée → sinon date de mise en charge.
  `indicateurs.ts:110-114`

## Production et rendement

- `[CONFIRMÉ]` Production = somme des récoltes pesées si > 0, sinon
  biomasse finale estimée. Production **nette** = production −
  biomasse initiale. `indicateurs.ts:154-156`
- `[CONFIRMÉ]` Densité, charge et rendement se raisonnent au **m²** ou au
  **m³** selon `mesureBase` du type d'infrastructure.
  `indicateurs.ts:158-164`
- `[CONFIRMÉ]` Rendement annualisé : `t/ha/an` en surface (×10 pour
  passer de kg/m² à t/ha), `kg/m³/an` en volume. L'unité des
  statistiques de production, donc celle qui permet de se situer dans
  une moyenne régionale. `indicateurs.ts:171-176`

## Alimentation

- `[CONFIRMÉ]` Indice de consommation = aliment distribué / production
  **NETTE**. Le rapporter au poids brut flatte le résultat en créditant
  l'élevage du poids des alevins mis en charge. `indicateurs.ts:186-187`
- `[CONFIRMÉ]` On enregistre le **distribué**, pas le planifié : l'indice
  de consommation n'a de sens que sur du réel.
  `schema.prisma:554-555`
- `[CONFIRMÉ]` Un palier de ration contraint par la température l'emporte
  sur un palier générique. Ignorer la température conduit à suralimenter
  en eau froide — de l'aliment payé qui pollue le bassin au lieu de
  devenir du poisson. `rationnement.ts:32-43`
- `[CONFIRMÉ]` Bornes de palier : `poidsMin ≤ p < poidsMax`,
  `temperatureMin ≤ t < temperatureMax` (inclusif bas, exclusif haut).
  `rationnement.ts:27-38`
- `[CONFIRMÉ]` Taux de rationnement contraint **0–10 %** sur `Pesee`,
  **0–30 %** sur `PalierRationnement`. `migration.sql:20-25`

## Géométrie

- `[CONFIRMÉ]` Circulaire → `π × (diamètre/2)²`. Sinon →
  `longueur × largeur`. `geometrie.ts:14-21`
- `[CONFIRMÉ]` Volume = surface × profondeur × `niveauRemplissage/100`
  (défaut 100). Un bassin d'un mètre rempli à 80 % ne contient pas le
  volume de sa profondeur totale. `geometrie.ts:28-33`

## Économie

- `[CONFIRMÉ]` Coût des alevins de remplacement = **somme des produits**
  ligne à ligne, pas produit des sommes. Prix pris sur la mortalité, à
  défaut sur le lot. `indicateurs.ts:192-195`
  → régression connue de la version précédente : la somme des
  remplacements était multipliée par la somme des prix unitaires, ce qui
  facturait l'alevin 330 F au lieu de 110 F après trois pesées, l'erreur
  croissant avec la durée du cycle. `indicateurs.ts:13-17`
- `[CONFIRMÉ]` Charges = alevins + aliments + traitements + autres
  dépenses. `indicateurs.ts:205`
- `[CONFIRMÉ]` **Dons et autoconsommation sont valorisés** au même titre
  que les ventes. Sans cela un pisciculteur qui nourrit sa famille
  apparaîtrait en perte alors qu'il produit de la valeur.
  `indicateurs.ts:215-220`
- `[CONFIRMÉ]` Prix de vente moyen calculé sur les **ventes seules**
  (`vente.quantiteKg`), pas sur l'ensemble des sorties.
  `indicateurs.ts:223`
- `[CONFIRMÉ]` Prix de revient rapporté à la production **totale**
  (brute), pas nette. `indicateurs.ts:222`
- `[CONFIRMÉ]` Prix d'aliment figé à l'achat (`prixKgApplique`) : le
  référentiel évolue, les charges passées non. `schema.prisma:570-571`
- `[CONFIRMÉ]` Toutes les divisions sont gardées par un test sur le
  dénominateur et renvoient `null` plutôt que `NaN` ou `Infinity`.
  `indicateurs.ts:89, 119, 127, 162-164, 187, 222-227`

## Conformité sanitaire

- `[CONFIRMÉ]` `finDelaiAttente = dateOperation + delaiAttenteJours` du
  produit. Toute récolte antérieure à la **plus tardive** des fins de
  délai du cycle est comptée non conforme.
  `schema.prisma:592-594`, `indicateurs.ts:230-234`
- `[CONFIRMÉ]` Les délais d'attente du seed sont des **places tenues**, à
  confirmer auprès du service vétérinaire avant mise en production.
  C'est une règle de sécurité sanitaire des aliments, pas un paramètre
  libre. `seed.ts:89-91`

## Intégrité base (hors langage Prisma)

- `[CONFIRMÉ]` **Un seul cycle ouvert par infrastructure.** Index unique
  partiel `WHERE dateCloture IS NULL AND deletedAt IS NULL`. Si deux
  appareils ouvrent un cycle hors ligne sur le même bassin, le second
  est rejeté — erreur métier à montrer à l'agent, pas incident technique
  à contourner. `migration.sql:10-12`
- `[CONFIRMÉ]` `Echantillon.nombre > 0`. `migration.sql:15-16`
- `[CONFIRMÉ]` `dateCloture >= dateMiseEnCharge`. `migration.sql:28-30`
- `[CONFIRMÉ]` Mortalité et remplacement ≥ 0. `migration.sql:33-35`

## Modèle relationnel — points structurants

- `[CONFIRMÉ]` **L'espèce descend au niveau du `Lot`**, pas du `Cycle` :
  c'est ce qui rend la polyculture possible. `Cycle.especeId` n'est
  qu'une espèce dominante facultative, pour le filtrage et l'affichage.
  `schema.prisma:435-438`, `schema.prisma:459-460`
- `[CONFIRMÉ]` La mortalité est datée par elle-même (`dateConstat`), pas
  portée par la pêche de contrôle — sinon impossible de la situer entre
  deux pesées. `schema.prisma:487-493`
- `[CONFIRMÉ]` Les échantillons individuels sont conservés, pas leur
  moyenne : quatre colonnes de plus donnent le coefficient de variation,
  donc la décision de tri. `schema.prisma:531-533`
- `[CONFIRMÉ]` Géographie en clés étrangères, jamais en texte libre : la
  consolidation régionale ne doit pas reposer sur une comparaison de
  chaînes (« Sikasso » contre « sikasso »). `schema.prisma:232-234`
- `[CONFIRMÉ]` `AccesFerme` est une **relation**, pas un champ sur
  l'utilisateur : un encadreur a autant de lignes que de fermes suivies.
  Contrainte `@@unique([userId, fermeId])`. `schema.prisma:309-323`
- `[CONFIRMÉ]` `codeFao` laissé vide plutôt que deviné : un code faux
  agrégerait la production nationale sous la mauvaise espèce. Seul
  `TLN` (Tilapia du Nil) est renseigné. `schema.prisma:111-113`,
  `seed.ts:21`
- `[CONFIRMÉ]` Soft delete (`deletedAt`) sur toutes les tables de saisie ;
  les référentiels utilisent `actif` à la place.
- `[CONFIRMÉ]` `Ferme.latitude/longitude` en `Decimal(10,7)` ≈ 1 cm.
  L'ancien `float(20,20)` n'avait aucune partie entière et ne pouvait pas
  stocker une latitude de 12,65. `schema.prisma:364-367`

## Ce qui n'est PAS encore une règle

Aucune alerte n'est levée nulle part. `performance` (gain quotidien /
référence espèce, `indicateurs.ts:239-242`), `densiteMaxM2/M3`,
`oxygeneMin`, `temperatureOpt*`, `poidsMarcheMin/Max`, seuil de CV :
tout cela est **stocké et calculé**, rien n'est **interprété**. Le
moteur d'alertes reste à écrire — voir `ETAPES.md`.
