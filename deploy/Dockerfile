# syntax=docker/dockerfile:1
#
# Deux images depuis le même monorepo :
#   --target api  → l'API NestJS, qui applique les migrations au démarrage
#   --target web  → Caddy : HTTPS automatique, admin et PWA en fichiers statiques
#
# Construit depuis la racine du dépôt : docker compose -f deploy/docker-compose.yml build

FROM node:24-bookworm-slim AS base
# openssl : requis par le moteur de migration de Prisma.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# pnpm à la version du `packageManager` du dépôt — jamais npm (voir ARCHITECTURE.md).
RUN corepack enable
WORKDIR /app

FROM base AS construction
COPY . .
RUN pnpm install --frozen-lockfile
# Adresse publique de l'API, figée dans l'admin et la PWA au build (Vite).
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm --filter @aqua/shared build \
 && pnpm --filter @aqua/api build \
 && pnpm --filter @aqua/admin build \
 && pnpm --filter @aqua/pwa build

FROM base AS api
COPY --from=construction /app /app
WORKDIR /app/apps/api
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
# Migrations d'abord : une API qui démarre sur un schéma en retard renverrait
# des erreurs de colonne au lieu de refuser de démarrer.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && exec node dist/main.js"]

FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=construction /app/apps/admin/dist /srv/admin
COPY --from=construction /app/apps/pwa/dist /srv/pwa
