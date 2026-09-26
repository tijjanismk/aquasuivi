# Module : shared/indicateurs

Rôle : calculer tous les indicateurs zootechniques et économiques d'un
cycle, en une fonction pure.

## Fichiers
- `packages/shared/src/indicateurs.ts` (308 l.) — fonction unique
  `calculerIndicateurs`, plus deux aides d'arrondi privées.

## Fonctions exposées
- `calculerIndicateurs(d: CycleComplet) → Indicateurs` — aucune lecture
  base, aucun I/O. Appelle `joursEntre` et `parDate` (dates.ts).
- `type Indicateurs = ReturnType<typeof calculerIndicateurs>`
- `interface EtatLot` — état d'un lot : effectifs, poids moyen, biomasse.

## Forme du retour

```
{ cycle:        { id, numero, statut, infrastructure, dateMiseEnCharge,
                  dateCloture, dureeJours }
  lots:         EtatLot[]
  zootechnie:   { effectifInitial, effectifFinal, mortalite, remplacement,
                  tauxSurviePct, poidsMoyenInitialG, poidsMoyenFinalG,
                  gainMoyenQuotidienGJ, tauxCroissanceSpecifiquePctJ,
                  coefficientVariationPct, nombrePesees, performance }
  production:   { biomasseInitialeKg, biomasseFinaleKg, productionRecolteeKg,
                  productionNetteKg, densiteInitiale, chargeFinale,
                  uniteMesure, rendementCycle, rendementAnnuel }
  alimentation: { alimentDistribueKg, indiceConsommation, coutAlimentParKg }
  economie:     { charges{alevins,aliments,traitements,autres,total},
                  produits{vente,don,autoconsommation,total},
                  prixRevientKg, prixVenteMoyenKg, margeKg, resultat,
                  rentabilitePct }
  conformite:   { finDelaiAttente, recoltesNonConformes } }
```

Toute valeur non calculable vaut `null`, jamais `NaN` ni `Infinity`.

## Entrant
Importé par : `packages/shared/src/index.ts` (barrique),
`packages/shared/test/b4.ts`.
À venir : service `Cycle` de l'API, écran de fiche cycle (admin, mobile).

## Sortant
Importe : `./dates` (`joursEntre`, `parDate`), `./types`.

## Règles métier
- [CONFIRMÉ] Effectif = `nombre − mortalités + remplacements`, plancher 0
  — `indicateurs.ts:57`
- [CONFIRMÉ] Survie rapportée à `effectifInitial + remplacements` —
  `indicateurs.ts:88-89`
- [CONFIRMÉ] Poids moyen d'un lot = dernière pesée où il a été
  échantillonné ; en monoculture un échantillon sans `lotId` est
  rattaché au lot unique — `indicateurs.ts:61-68`
- [CONFIRMÉ] La récolte comptée prime sur l'estimation pour le poids
  moyen final — `indicateurs.ts:97-108`
- [CONFIRMÉ] Date de fin : `dateCloture` → récolte la plus tardive →
  dernière pesée → mise en charge — `indicateurs.ts:110-114`
- [CONFIRMÉ] TCS = `(ln Pf − ln Pi)/jours × 100` — `indicateurs.ts:126-129`
- [CONFIRMÉ] CV sur les échantillons de la dernière pesée, variance
  `n−1`, min. 2 échantillons — `indicateurs.ts:137-149`
- [CONFIRMÉ] Rendement annualisé `t/ha/an` en surface (facteur 10),
  `kg/m³/an` en volume — `indicateurs.ts:171-176`
- [CONFIRMÉ] IC = aliment / production **nette** — `indicateurs.ts:186-187`
- [CONFIRMÉ] Coût des remplacements = somme des produits ligne à ligne ;
  prix pris sur la mortalité, à défaut sur le lot — `indicateurs.ts:192-195`
- [CONFIRMÉ] Dons et autoconsommation valorisés dans les produits ; le
  prix de vente moyen ne porte que sur les ventes —
  `indicateurs.ts:215-223`
- [CONFIRMÉ] Prix de revient sur la production **brute** —
  `indicateurs.ts:222`
- [CONFIRMÉ] Non-conformité = récolte antérieure à la plus tardive des
  `finDelaiAttente` du cycle — `indicateurs.ts:230-234`
- [CONFIRMÉ] Montants entiers via `francs()` — `indicateurs.ts:28`
- [DÉDUIT] `performance < 1` devrait lever une alerte ; aujourd'hui la
  valeur est seulement retournée — `indicateurs.ts:239-242`

## Régressions corrigées (documentées en tête de fichier, l. 13-20)
1. Coût des alevins de remplacement : produit des sommes → somme des
   produits. L'ancien calcul facturait l'alevin 330 F au lieu de 110 F
   après trois pesées, l'erreur croissant avec la durée du cycle.
2. Production : la récolte pesée fait foi ; l'ancien rapport ignorait
   les ventes.
3. Toutes les divisions gardées.

## Pièges
- La fonction attend des `number`. Un `Prisma.Decimal` passé tel quel
  fera concaténer les additions. L'adaptation est à la charge de
  l'appelant — **elle n'est pas écrite**.
- `infrastructure.superficie` / `.volume` sont **lus** (l. 159) mais
  jamais calculés ailleurs dans le dépôt. Tant que l'API ne les remplit
  pas via `geometrie.ts`, densité, charge et rendement valent `null`.
