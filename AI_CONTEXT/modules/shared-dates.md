# Module : shared/dates

Rôle : arithmétique sur des dates de terrain, sans fuseau ni heure.

## Fichiers
- `packages/shared/src/dates.ts` (34 l.)

## Fonctions exposées
- `joursEntre(a: DateISO, b: DateISO) → number` — négatif si `b`
  précède `a`. Passe par `Date.parse` forcé en UTC (`T00:00:00Z`).
- `ajouterJours(date: DateISO, jours: number) → DateISO`
- `aujourdhui() → DateISO` — **sans apostrophe** dans le nom
- `estAvant(a, b) → boolean` — simple comparaison de chaînes
- `parDate<T>(liste: T[], cle: (item: T) => DateISO) → T[]` — tri
  ascendant, **copie** la liste (`[...liste]`), n'altère pas l'entrée

## Entrant
Importé par : `indicateurs.ts` (`joursEntre`, `parDate`), `index.ts`.

## Sortant
Importe : `./types` (type `DateISO` seulement).

## Règles métier
- [CONFIRMÉ] Toute conversion force `T00:00:00Z` : manipuler ces dates
  comme des `Date` locales introduit un décalage qui fait glisser une
  saisie au jour précédent — bug silencieux et pénible à diagnostiquer —
  `dates.ts:1-7, 15, 19`
- [CONFIRMÉ] `estAvant` compare lexicographiquement : sur le format ISO,
  l'ordre des chaînes est l'ordre chronologique — `dates.ts:28`
- [CONFIRMÉ] `joursEntre` arrondit (`Math.round`) — absorbe les heures
  d'été, qui ne devraient pas exister ici puisque tout est en UTC

## Pièges
- `aujourdhui()` renvoie la date **UTC**, pas la date locale de
  l'appareil. Au Mali (UTC+0) c'est équivalent ; ailleurs, non. À
  reconsidérer si l'application sort du fuseau.
- Aucune validation de forme : une chaîne malformée ne lève pas
  d'erreur, elle produit `NaN` en aval.

## Couverture
Testé indirectement par `test/b4.ts` (durée de cycle : 212 jours).
Aucun test direct.
