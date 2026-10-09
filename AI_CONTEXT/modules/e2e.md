# Module : e2e

Rôle : rejouer en navigateur réel le parcours d'administration complet,
du clic jusqu'à PostgreSQL.

## Fichiers
- `apps/e2e/test/navigateur.ts` — pilotage CDP, réutilisable
- `apps/e2e/test/parcours-cycle.ts` — le cycle B4 via l'API (`test:cycle`)
- `apps/e2e/test/parcours-mcp.ts` — le serveur MCP en JSON-RPC (`test:mcp`)
- `apps/e2e/test/parcours-admin.ts` — les référentiels en navigateur (`test:admin`)
- `apps/e2e/test/parcours-saisie.ts` — la saisie en navigateur (`test:saisie`)
- `apps/e2e/donnees/donnees-test.ts` — **pas un test** : remplit la base
  de démonstration par l'API (6 fermes « [TEST] » géolocalisées sauf une,
  10 cycles, 4 comptes 7999…, mot de passe `test-aqua-2026`) ;
  `pnpm db:donnees-test`, `-- --effacer` pour retirer. Rejouable, aléa à
  graine fixe. Jamais en production

Chacun se lance seul : `pnpm --filter @aqua/e2e test:saisie`.

## Lancer

```bash
pnpm dev:api      # dans un terminal
pnpm dev:admin    # dans un autre
pnpm test:e2e
```

Sortie dans le même style que `pnpm test:shared` : une ligne par
contrôle, `TOUS LES CONTROLES PASSENT`, code de sortie non nul en cas
d'échec. Si un serveur manque, le test le dit et s'arrête — il ne
retourne pas un faux vert.

## Pourquoi sans Playwright ni Puppeteer

Chrome et Edge sont déjà installés sur le poste, et Node ≥ 22 fournit un
`WebSocket` natif : piloter le navigateur en CDP ne demande donc **aucune
dépendance ni téléchargement**. `navigateur.ts` tient en une page.

Le jour où il faut plusieurs navigateurs, des attentes plus fines ou des
traces, Playwright se justifiera. Pas avant.

## Règles métier
- [CONFIRMÉ] Toujours démarrer le navigateur avec un `--user-data-dir`
  jetable : sans lui, le binaire rejoint la session ouverte de
  l'utilisateur au lieu d'en créer une
- [CONFIRMÉ] React ignore une affectation directe de `.value` — il faut
  le setter natif puis un évènement qui remonte (`OUTILS_SAISIE`)
- [CONFIRMÉ] `confirm()` est refusé d'office en headless : le scénario le
  neutralise avant de tester la désactivation
- [CONFIRMÉ] Le nettoyage tourne **avant et après** : une exécution
  interrompue laisse sa ligne, et la création suivante échouerait en
  doublon
- [CONFIRMÉ] Sous Windows, le profil temporaire reste verrouillé un
  instant après l'arrêt ; sa suppression est un confort et ne doit jamais
  faire échouer le test

## Piège : une attente trop lâche valide n'importe quoi

Première version de l'assertion de navigation : « il y a des lignes ».
Elle passait — en comptant les lignes du référentiel **précédent**,
encore affichées pendant le chargement. Elle masquait ainsi un vrai
défaut d'affichage (corrigé depuis par le remontage, voir
`modules/admin.md`).

Attendre un marqueur **propre à la cible** — ici un en-tête de colonne
des paliers *et* des lignes — puis comparer au total réel de l'API.
