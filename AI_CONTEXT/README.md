# AI_CONTEXT

Carte du projet Aqua-Suivi, destinée à être lue **à la place du code
source** au début d'une tâche.

## Quoi lire, selon ce qu'on fait

| Situation | Lire |
|---|---|
| Première fois sur le projet | `ARCHITECTURE.md` seul (1 page) |
| « Pourquoi c'est fait comme ça ? » | `DECISIONS.md` |
| Modifier une formule, un calcul | `DOMAINE.md` + la fiche du module |
| Savoir quoi faire ensuite | `ETAPES.md` |
| Avant de supprimer ou refactorer | `ALERTES.md` |
| Travailler sur un fichier précis | `modules/<module>.md` |

## Contenu

```
ARCHITECTURE.md   stack, découpage, points d'entrée, règle de dépendance
DOMAINE.md        règles métier, chacune avec fichier:ligne
DECISIONS.md      17 décisions : le problème, le choix, ce qu'il coûte
ETAPES.md         état réel et suite, avec critères de fin vérifiables
ALERTES.md        orphelins, trous de couverture, dette déclarée
carte.json        généré — ne pas éditer à la main (périmé : ne connaît
                  ni apps/api/src/ ni apps/admin/)
modules/          une fiche par module
  api-persistance.md   schéma, migrations, seed
  api-referentiels.md  routes, conversions, erreurs
  api-saisie.md        CRUD de terrain, indicateurs d'un cycle
  admin.md             back-office React/Refine
  e2e.md               parcours en navigateur réel
  mcp.md               serveur MCP, lecture seule
  shared-*.md          socle de calcul
```

## Convention

- `[CONFIRMÉ]` — lu dans le code, adossé à un `fichier:ligne`
  réouvrable.
- `[DÉDUIT]` — probable, non vérifié. **À confirmer avant de s'en
  servir.** Une règle inventée dans une carte se propage ensuite dans
  tout le code écrit à partir d'elle.

## Régénérer

```bash
python3 <skill>/scripts/carte.py . --json AI_CONTEXT/carte.json --md
```

Ne réécrire que les fiches des modules dont les symboles ou les
dépendances ont bougé. Après toute modification qui ajoute une
fonction, change une signature ou crée une dépendance, mettre à jour la
fiche concernée **dans la foulée** : une carte périmée est un piège,
parce qu'elle est crue.

## Ce que la carte ne remplace pas

Le code reste la vérité. Quand une décision dépend du comportement
exact — une condition, un ordre d'écriture, une transaction — ouvrir le
fichier.
