# Mise en ligne d'Aqua-Suivi

Une seule machine suffit : PostgreSQL, l'API et un serveur Caddy qui obtient
lui-même les certificats HTTPS et sert l'admin et l'application de terrain.

> **Pourquoi HTTPS est obligatoire.** Sans lui, un téléphone refuse
> d'installer l'application et de la faire fonctionner hors ligne.

## Ce qu'il faut

- Un serveur Linux joignable depuis Internet (2 Go de mémoire suffisent),
  avec Docker et le plugin Compose.
- Un nom de domaine, et **trois sous-domaines** qui pointent vers l'adresse
  IP du serveur (enregistrements DNS de type A) :

  | Sous-domaine | Sert à |
  |---|---|
  | `terrain.…` | l'application des pisciculteurs (PWA, à installer sur le téléphone) |
  | `admin.…` | l'administration |
  | `api.…` | l'API |

- Les ports 80 et 443 ouverts (Let's Encrypt passe par le port 80).

## Première installation

```sh
git clone https://github.com/tijjanismk/aquasuivi.git /opt/aquasuivi
cd /opt/aquasuivi
cp deploy/.env.exemple deploy/.env
```

Remplir `deploy/.env` : les trois domaines, un e-mail, et des secrets
**générés**, jamais inventés :

```sh
openssl rand -base64 32   # POSTGRES_PASSWORD
openssl rand -base64 48   # JWT_SECRET
```

Puis construire et démarrer :

```sh
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

L'API applique les migrations de la base à chaque démarrage. Il reste à
charger les référentiels (espèces, aliments, produits, paliers de ration)
et à créer le premier administrateur, avec `AQUA_ADMIN_TELEPHONE` et
`AQUA_ADMIN_MOT_DE_PASSE` renseignés dans `deploy/.env` :

```sh
docker compose -f deploy/docker-compose.yml --env-file deploy/.env \
  exec api pnpm exec tsx prisma/seed.ts
```

Le seed peut être relancé sans risque : il ne duplique rien et remet le mot
de passe de l'administrateur à la valeur du fichier.

Vérifier : `https://api.…/api/sante` répond `{"base":"ok",…}`, l'admin
s'ouvre sur `https://admin.…`, et le téléphone propose « Installer
l'application » sur `https://terrain.…`.

## Mettre à jour

```sh
cd /opt/aquasuivi
git pull
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

Les téléphones reçoivent la nouvelle version à leur prochaine ouverture de
l'application, sans rien perdre : leurs saisies non envoyées restent dans
leur base locale.

## Sauvegardes

```sh
chmod +x deploy/sauvegarder.sh
crontab -e
# 0 2 * * * /opt/aquasuivi/deploy/sauvegarder.sh >> /var/log/aquasuivi-sauvegarde.log 2>&1
```

Une sauvegarde par nuit, gardée 14 jours dans `/var/backups/aquasuivi`.
**Copiez-les aussi hors du serveur** : une sauvegarde sur le même disque ne
protège pas d'une panne de disque.

Restaurer :

```sh
gunzip -c /var/backups/aquasuivi/aquasuivi-AAAAMMJJ-HHMM.sql.gz \
  | docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec -T db \
    psql -U aqua -d aquasuivi
```

## Sécurité, en bref

- La base n'est pas exposée : seule l'API la joint.
- L'API n'accepte que les appels venant de l'admin et de l'application de
  terrain (`AQUA_ORIGINES`, rempli automatiquement depuis les domaines).
- Les tentatives de connexion et les inscriptions sont limitées par
  adresse ; Caddy transmet l'adresse réelle du téléphone.
- Changer `JWT_SECRET` déconnecte tout le monde en 15 minutes au plus :
  à faire si le fichier `.env` a pu fuiter.
