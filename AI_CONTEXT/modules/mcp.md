# Module : mcp

Rôle : exposer les données d'Aqua-Suivi à un assistant, **en lecture
seule**, pour interroger et analyser la production.

## Fichiers
- `apps/mcp/src/serveur.ts` — les sept outils
- `apps/mcp/src/api.ts` — client HTTP, `GET` uniquement
- `.mcp.json` (racine) — déclaration du serveur pour les clients MCP

## Les sept outils

| Outil | Usage |
|---|---|
| `lister_fermes` | point de départ : les autres outils veulent un identifiant |
| `lister_infrastructures` | bassins et étangs d'une ferme, superficie et volume |
| `lister_cycles` | cycles d'une infrastructure, filtrables par statut |
| `indicateurs_cycle` | **l'outil d'analyse** : zootechnie, économie, conformité |
| `consulter_referentiel` | espèces, aliments, types, produits, paliers |
| `resume_ferme` | ferme + infrastructures + cycle ouvert, en un appel |
| `configuration` | langue et devise actives |

## Lancer

```bash
pnpm dev:api          # le serveur MCP interroge l'API, elle doit tourner
pnpm mcp              # ou directement : node apps/mcp/dist/serveur.js
```

`dist/` est reconstruit à chaque `pnpm install` (script `prepare`).
Transport stdio. `AQUA_API_URL` pointe ailleurs si besoin.

## Règles métier
- [CONFIRMÉ] **Aucun outil n'écrit.** Le client HTTP de `api.ts` ne sait
  faire que des `GET` : la restriction est structurelle, pas une consigne
  qu'on pourrait oublier en ajoutant un outil
- [CONFIRMÉ] Le serveur passe par l'**API**, jamais par PostgreSQL. C'est
  l'API qui convertit les `Decimal` en nombres et les dates de terrain en
  « AAAA-MM-JJ » ; attaquer la base directement obligerait à réécrire ces
  conversions, donc à les faire diverger
- [CONFIRMÉ] Les erreurs reviennent en texte lisible avec `isError`, pas
  en pile d'appels : un assistant doit pouvoir expliquer le refus
- [CONFIRMÉ] Les montants sont des nombres bruts, sans symbole, dans la
  devise de `configuration`

## Pourquoi lecture seule

Les données de production d'une ferme ne doivent pas pouvoir être
modifiées par une conversation. Le jour où l'écriture se justifie — saisir
une pesée à la voix, par exemple — elle demandera un garde-fou explicite
et sans doute l'authentification, qui n'existe pas encore.

## Vérification

`pnpm --filter @aqua/e2e test:mcp` lance le **serveur compilé**, échange
en JSON-RPC sur stdio et appelle les outils. Il vérifie aussi qu'aucun
outil d'écriture n'est apparu.

Deux pièges rencontrés en l'écrivant : Node 24 refuse de lancer un `.cmd`
sans shell (donc pas de `npx` dans un `spawn` — on lance `dist/` avec le
Node courant), et `shell: true` avec des arguments ne les échappe pas.
