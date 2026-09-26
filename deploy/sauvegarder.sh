#!/bin/sh
# Sauvegarde quotidienne de la base, à lancer par cron sur le serveur :
#   0 2 * * * /opt/aquasuivi/deploy/sauvegarder.sh >> /var/log/aquasuivi-sauvegarde.log 2>&1
#
# Garde 14 jours. Une sauvegarde qui reste sur le même disque que la base ne
# protège pas d'une panne de disque : copier aussi le dossier ailleurs.
set -eu

ICI=$(cd "$(dirname "$0")" && pwd)
DOSSIER=${AQUA_SAUVEGARDES:-/var/backups/aquasuivi}
mkdir -p "$DOSSIER"

. "$ICI/.env"
FICHIER="$DOSSIER/aquasuivi-$(date +%Y%m%d-%H%M).sql.gz"

docker compose -f "$ICI/docker-compose.yml" --env-file "$ICI/.env" exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "${POSTGRES_DB:-aquasuivi}" --no-owner \
  | gzip > "$FICHIER"

find "$DOSSIER" -name 'aquasuivi-*.sql.gz' -mtime +14 -delete
echo "$(date -Iseconds) sauvegarde : $FICHIER ($(du -h "$FICHIER" | cut -f1))"
