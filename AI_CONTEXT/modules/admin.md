# Module : admin

Rôle : back-office React/Refine. Administration des référentiels **et**
saisie de terrain, de la ferme jusqu'aux indicateurs d'un cycle.

## Fichiers
- `apps/admin/src/description.ts` — **le fichier à ouvrir en premier** :
  les types `Champ` et `Ressource` dont tout le reste découle
- `apps/admin/src/referentiels.ts` — les 5 référentiels administrés
- `apps/admin/src/saisie.ts` — les 12 tables de terrain et leur hiérarchie
- `apps/admin/src/ressources.ts` — index commun, recherche par nom ou chemin
- `apps/admin/src/i18n.ts` — libellés et formats (D16)
- `apps/admin/src/index.css` — jetons de couleur, clair et sombre
- `apps/admin/src/composants/ui/` — les composants, à nous (D17)
- `apps/admin/src/composants/TableauRessource.tsx` — tableau réutilisable
- `apps/admin/src/composants/FormulaireRessource.tsx` — formulaire réutilisable
- `apps/admin/src/pages/` — les écrans, qui ne font qu'assembler

## Principe : les écrans sont engendrés, pas écrits

Une `Ressource` décrit ses champs — libellé, type, options, aide. Liste
et formulaire se construisent à partir de cette description. **Ajouter
une colonne au schéma Prisma = ajouter une ligne dans une description**,
pas écrire un écran.

Conséquence à connaître : un champ absent de la description n'est ni
affiché ni envoyé. C'est voulu — le payload ne contient que des champs
décrits, donc jamais `id`, `createdAt` ni un objet de relation, que
l'API refuserait. Les champs marqués `calcule` (superficie, volume,
`finDelaiAttente`) s'affichent mais ne se saisissent pas.

## La saisie suit la hiérarchie, pas des listes plates

Une pesée n'existe que dans un cycle, une mortalité que dans un lot.
Lister « toutes les pesées » n'aurait aucun sens, et l'API elle-même
attend un filtre parent. D'où :

```
/fermes                 liste
/fermes/:id             fiche + ses infrastructures
/infrastructures/:id    fiche + ses cycles
/cycles/:id             indicateurs + 7 sections de saisie
/pesees/:id             fiche + ses échantillons
/lots/:id               fiche + ses mortalités
/saisie/:ressource/…    formulaires, parent en paramètre d'URL
```

`FicheParent.tsx` sert les quatre fiches « parent → enfants » : une seule
implémentation, une table de configuration. `FicheCycle.tsx` est à part —
c'est le seul écran qui affiche un calcul.

Le retour se passe en paramètre `?retour=` : après avoir ajouté une
pesée depuis un cycle, on revient au cycle, pas sur une liste plate qui
n'existe pas.

## Règles métier
- [CONFIRMÉ] Le bouton de suppression s'appelle « Désactiver ». Sur un
  référentiel l'API pose `actif: false` ; sur une table de saisie elle
  pose `deletedAt` (D12). Dans les deux cas la ligne reste en base
- [CONFIRMÉ] Les saisies numériques sont converties avant envoi.
  **À la création, un champ vide est omis ; à la modification il est
  envoyé à `null`** — voir les pièges ci-dessous
- [CONFIRMÉ] Chaque ressource déclare son `triDefaut` : toutes n'ont pas
  de colonne `nom`
- [CONFIRMÉ] Une date se saisit dans un `input[type=date]` et part en
  « AAAA-MM-JJ ». À la relecture, on tronque à 10 caractères : un
  horodatage complet laisserait le champ vide sans le dire

## Interface

Tailwind v4, composants shadcn/ui sur primitives Radix (D24), ajoutés
par `pnpm dlx shadcn@latest add` grâce à `components.json`. Thème vert :
une gamme `--vert-50` … `--vert-950` dans `index.css`, d'où découlent
tous les jetons ; la changer là la change partout (et dans la PWA, dont le
fichier est identique).

**Carte** (`pages/Carte.tsx`, D25) : Leaflet + fond OpenStreetMap, un
point par ferme géolocalisée, coloré selon ses alertes.

Le **thème sombre suit le réglage du système** (`main.tsx` pose la classe
`dark`). Sans cette bascule, les jetons sombres seraient du CSS mort.

Deux règles de lisibilité apprises à l'écran :
- les colonnes de nombres sont **alignées à droite** et en chiffres de
  largeur fixe (`.tabulaire`), sinon les ordres de grandeur ne se
  comparent pas d'une ligne à l'autre ;
- les en-têtes de colonne ne sont **ni en majuscules ni en `nowrap`** :
  les libellés français sont longs (« Gain journalier de référence
  (g/j) ») et faisaient déborder le tableau, coupant les actions.

## Quatre pièges, trouvés à l'usage et pas au typecheck

**1. Le tri par défaut ne peut pas être `nom`.** `PalierRationnement`
n'a pas cette colonne : trier dessus fait échouer la requête, et la
liste s'affichait vide — sous un message affirmant à tort que l'API était
injoignable, alors qu'elle avait répondu 400.

**2. Les listes partagent une route.** `App.tsx` remonte donc la page via
une clé sur `:ressource` et `:id` (`ParRessource`). Sans elle, React
réutilise l'instance : le tri de la ressource précédente reste actif, et
le tableau affiche un instant **les colonnes de la nouvelle avec les
lignes de l'ancienne**. Retirer cette clé fait revenir les deux défauts
en silence.

**3. Un champ vide ne doit pas partir à `null` à la création.**
Plusieurs colonnes sont NOT NULL avec valeur par défaut
(`frequenceRepas`, `unite`, `ordre`…) : un `null` explicite les fait
rejeter par Prisma, avec un « Champs invalides » peu parlant. On omet
donc la clé à la création — la base applique son défaut — et on envoie
`null` à la modification, sans quoi on ne pourrait plus vider un champ
(D11 demande justement de laisser un `codeFao` douteux vide).

**4. Les noms de champs des indicateurs ne s'inventent pas.** La fiche de
cycle lisait `alimentation.quantiteTotaleKg` ; le socle expose
`alimentDistribueKg`. Résultat : un tiret à l'écran, aucune erreur nulle
part. `test:cycle` verrouille désormais ces noms.

## Les tests ne s'accrochent jamais au style

Les parcours ciblent des attributs `data-test` (`tableau`, `ligne`,
`colonne`, `recherche`, `erreur`, `enregistrer`, `lien-modifier`,
`bouton-desactiver`, `nav`, `indicateurs`), jamais des classes CSS.

Ce n'est pas une préférence : l'interface a été **entièrement réécrite**
en Tailwind sans qu'un seul contrôle ne tombe. En visant `.erreur` ou
`.laterale`, tout le parcours serait tombé pour une raison cosmétique.

Ajouter un écran, c'est donc aussi poser ses `data-test`.

## Pas encore fait
Utilisateurs et `AccesFerme` · écran des conflits `ConflitSync` ·
consolidation par commune/cercle/région. Et **aucun écran de connexion** :
l'API n'a pas d'authentification.

## Dépendances
`@refinedev/core` 5 (sans kit d'interface) et `@tanstack/react-query` 5,
`@refinedev/simple-rest`, `@refinedev/react-router`, `react-router` **7**
(Refine ne déclare pas encore la 8, D26), `radix-ui`, `leaflet` +
`react-leaflet`, `tailwindcss`, `class-variance-authority`,
`tailwind-merge`, `clsx`, `lucide-react`.

React 19, Vite 8, TypeScript 7 (D26).
