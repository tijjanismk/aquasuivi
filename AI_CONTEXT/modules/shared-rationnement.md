# Module : shared/rationnement

Rôle : trouver le palier de ration applicable et en déduire la ration
journalière qu'une pêche de contrôle fixe (D29).

Appelé par la PWA (`donnees.ts` → `etatCycle`, `ecrans/Pesee.tsx`) et
par l'API (`cycles.service.ts` → `POST /cycles/:id/ration`, utilisé par
le formulaire de pesée de l'admin). La ration se calcule sur le poids
**de la pêche en cours de saisie**, pas sur celui de la précédente. Le
conseil ne contraint pas la saisie : le taux retenu peut s'en écarter.

La quantité d'aliment d'une période (ration × jours jusqu'à la pêche
suivante) est dans `alimentation.ts` (`quantiteDistribuee`).

## Fichiers
- `packages/shared/src/rationnement.ts` (67 l.)

## Fonctions exposées
- `palierApplicable(paliers, especeId, poidsMoyenG, temperature?)
   → PalierRationnement | null`
- `ration(biomasseKg, tauxPct) → number` — kg/jour
- `rationConseillee(paliers, especeId, poidsMoyenG, biomasseKg,
   temperature?) → { tauxPct, rationKg, frequenceRepas, source } | null`

- `rationDuCycle(indicateurs, paliers, temperature?) → { especeId,
   poidsMoyenG, effectif, biomasseKg, conseil } | null` — palier de
   l'espèce du lot le plus lourd, appliqué à la biomasse totale
- `cycleAuJourDeLaPesee(cycle, pesee, echantillons) → CycleComplet` —
   le cycle au jour de la pêche, avec ses échantillons en cours de saisie

## Entrant
Importé par : `index.ts`, `apps/pwa/src/donnees.ts`,
`apps/pwa/src/ecrans/Pesee.tsx`, `apps/api/src/cycles/cycles.service.ts`.
La ration retenue est stockée dans `Distribution.rationKgJour` (D29).

## Sortant
Importe : `./types`, `./indicateurs` (type `Indicateurs` seulement).

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
`packages/shared/test/rationnement.ts` (70 l.) — bornes, priorité
thermique, retombée générique, absence de palier.
`packages/shared/test/alimentation.ts` — ration sur le poids du jour,
période close par la pêche suivante, quantité mesurée prioritaire.
