# Module : shared/geometrie

Rôle : dériver surface et volume en eau à partir des dimensions saisies.

⚠️ **API publique sans appelant.** Réexporté par `index.ts`, jamais
appelé dans le dépôt. Ce n'est pas du code mort : l'API et le mobile qui
l'utiliseront ne sont pas écrits. Voir ALERTES.md.

## Fichiers
- `packages/shared/src/geometrie.ts` (38 l.)

## Fonctions exposées
- `superficie(d: InfrastructureDim) → number | null` — m², arrondi 2 déc.
- `volume(d: InfrastructureDim) → number | null` — m³, appelle
  `superficie`
- `dimensionsCalculees(d) → { superficie, volume }` — les deux d'un coup,
  **tels qu'ils sont stockés sur l'infrastructure**

## Entrant
Importé par : `index.ts` uniquement.
**Devrait l'être par** : le service `Infrastructure` de l'API à
l'écriture, et le mobile pour l'aperçu immédiat.

## Sortant
Importe : `./types` (`InfrastructureDim`).

## Règles métier
- [CONFIRMÉ] Circulaire → `π × (diamètre/2)²` ; toute autre forme →
  `longueur × largeur` — `geometrie.ts:14-21`
- [CONFIRMÉ] Dimension manquante → `null`, jamais 0 ni `NaN` —
  `geometrie.ts:16, 19, 29`
- [CONFIRMÉ] Volume = surface × profondeur × `niveauRemplissage/100`,
  défaut 100 % : un bassin d'un mètre rempli à 80 % ne contient pas le
  volume de sa profondeur totale — `geometrie.ts:28-33`
- [CONFIRMÉ] `IRREGULIERE` tombe dans la branche rectangulaire — pour un
  étang en terre, `longueur × largeur` est une approximation assumée —
  `geometrie.ts:19`

## Pourquoi ici et pas en base
Sur la version Laravel, ces formules vivaient en colonnes générées
MySQL, donc **inaccessibles hors ligne**. Les ramener dans le paquet
partagé les rend calculables sur le téléphone avant toute
synchronisation — `geometrie.ts:4-6`

## Conséquence à connaître
`indicateurs.ts:159` lit `infrastructure.superficie` / `.volume` sans
jamais les calculer. Tant que l'API n'appelle pas
`dimensionsCalculees()` à l'écriture, densité, charge et rendement
valent `null`.

## Couverture
**Aucun test.** Les bornes (dimension absente, niveau de remplissage,
forme irrégulière) ne sont vérifiées nulle part. Étape 2 de ETAPES.md.
