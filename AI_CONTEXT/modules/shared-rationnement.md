# Module : shared/rationnement

Rôle : trouver le palier de ration applicable et en déduire la quantité
d'aliment du jour.

⚠️ **API publique sans appelant.** Réexporté par `index.ts`, jamais
appelé dans le dépôt. Destiné à l'écran de saisie mobile (ration
conseillée au moment de la pesée). Voir ALERTES.md.

## Fichiers
- `packages/shared/src/rationnement.ts` (67 l.)

## Fonctions exposées
- `palierApplicable(paliers, especeId, poidsMoyenG, temperature?)
   → PalierRationnement | null`
- `ration(biomasseKg, tauxPct) → number` — kg/jour
- `rationConseillee(paliers, especeId, poidsMoyenG, biomasseKg,
   temperature?) → { tauxPct, rationKg, frequenceRepas, source } | null`

## Entrant
Importé par : `index.ts` uniquement.
**Devrait l'être par** : écran de pesée du mobile, et l'API si le taux
conseillé est stocké avec la distribution.

## Sortant
Importe : `./types` (`PalierRationnement`).

## Règles métier
- [CONFIRMÉ] Sélection par espèce **et** classe de poids :
  `poidsMoyenG >= poidsMin` et `poidsMoyenG < poidsMax` — inclusif bas,
  exclusif haut — `rationnement.ts:27-29`
- [CONFIRMÉ] **Un palier contraint par la température l'emporte sur un
  palier générique.** La température est l'information la plus
  déterminante pour l'appétit ; l'ignorer conduit à suralimenter en eau
  froide — de l'aliment payé qui pollue le bassin au lieu de devenir du
  poisson — `rationnement.ts:12-19, 32-40`
- [CONFIRMÉ] Bornes thermiques : `temperature >= temperatureMin` et
  `temperature < temperatureMax` ; une borne `null` ne contraint pas —
  `rationnement.ts:34-37`
- [CONFIRMÉ] Un palier n'est « thermique » que si au moins une de ses
  deux bornes est renseignée — `rationnement.ts:37`
- [CONFIRMÉ] Retombée : palier générique (deux bornes nulles), sinon
  premier candidat — `rationnement.ts:42-43`
- [CONFIRMÉ] Aucun candidat → `null`. L'appelant décide quoi afficher ;
  le module n'invente pas de taux — `rationnement.ts:30`
- [CONFIRMÉ] `tauxPct` contraint 0–30 % en base — `migration.sql:24-25`
- [CONFIRMÉ] Chaque palier porte sa `source`, propagée dans le retour de
  `rationConseillee` — traçabilité devant un bailleur
- [CONFIRMÉ] Le taux retenu par l'opérateur (`Pesee.tauxRationPct`,
  contraint 0–10 %) peut s'écarter du palier conseillé : le conseil ne
  contraint pas la saisie — `schema.prisma:514-515`, `migration.sql:20-22`

## Pourquoi une table et pas des constantes
Les taux étaient auparavant écrits en dur dans les formules du
tableur — 0,06 puis 0,03, 0,02, 0,015, 0,01, **et deux multiplications
par zéro qui annulaient silencieusement la ration des dernières
pêches**. Ils sont désormais une donnée, interrogée ici —
`rationnement.ts:1-8`

## Piège dans `ration()`
```ts
return Math.round(biomasseKg * tauxPct) / 100;
```
L'arrondi a lieu **avant** la division par 100, donc la ration est
arrondie au décagramme près. Volontaire ou non, ce n'est pas
`arrondi(x, 2)` comme ailleurs dans le paquet. À vérifier contre le
besoin terrain — une balance de terrain ne pèse pas au gramme.

## Couverture
**Aucun test.** Priorité thermique et bornes sont exactement le genre de
logique où une inversion passe inaperçue. Étape 2 de ETAPES.md.
