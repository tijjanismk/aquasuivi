# Décisions d'architecture

Une décision par section : le problème, le choix, ce qu'il coûte.
Format court volontaire. Ce qui est écrit ici ne se rediscute pas sans
raison nouvelle — et se rediscute en modifiant ce fichier.

---

## D1 — TypeScript partout, plutôt que PHP/Filament

**Problème.** La version précédente était un Laravel/Filament abandonné
depuis trois ans. Le mobile hors-ligne aurait imposé de réécrire toutes
les formules zootechniques dans un second langage.

**Choix.** Monorepo TypeScript : NestJS (API), React/Refine (admin),
React Native (mobile), et un paquet `@aqua/shared` commun.

**Coût.** Écosystème plus mouvant que PHP. Pas d'admin « gratuit »
comme Filament — l'admin se construit.

**Gain.** `calculerIndicateurs` existe **une fois**. Un correctif de
formule corrige simultanément le serveur, l'admin et le téléphone. C'est
le seul gain qui justifie à lui seul la réécriture.

---

## D2 — `@aqua/shared` ne connaît aucun ORM

**Problème.** Les mêmes formules doivent tourner sur des lignes Prisma
(serveur) et sur des enregistrements WatermelonDB (téléphone).

**Choix.** `types.ts` définit des interfaces de domaine pures. Aucune
importation de Prisma, de WatermelonDB ni de Node dans `packages/shared`.

**Coût.** Une couche d'adaptation à écrire de chaque côté, notamment
`Prisma.Decimal → number`.

**Conséquence non négociable.** Toute importation d'ORM dans
`packages/shared/` est une régression : les formules divergeraient entre
mobile et serveur, ce qui est exactement le problème qu'on fuit.

---

## D3 — ULID générés par le client, pas d'auto-incrément

**Problème.** Deux agents sans réseau doivent créer des lignes qui ne
collisionneront pas à la synchronisation.

**Choix.** Clé primaire `String` ULID, générée par le client. Le
`@default(ulid())` du schéma ne sert qu'aux lignes nées côté serveur
(seed, back-office).

**Coût.** Clés de 26 caractères, index plus gros qu'un entier.

**Gain.** Pas de table de correspondance id-local / id-serveur, et
l'ULID est trié par date de création, donc les index restent compacts à
l'insertion — contrairement à un UUIDv4.

---

## D4 — Dates de terrain en chaînes `AAAA-MM-JJ`

**Problème.** Une saisie de terrain glissait au jour précédent selon le
fuseau du téléphone.

**Choix.** `type DateISO = string`. Aucun objet `Date` ne traverse le
domaine. Les comparaisons se font en lexicographique, qui coïncide avec
l'ordre chronologique sur ce format.

**Coût.** Pas de vérification de type sur la forme de la chaîne ; une
date malformée n'est détectée qu'à l'usage.

**Gain.** Un bug silencieux de moins, et le format traverse JSON sans
sérialisation.

---

## D5 — L'espèce au niveau du lot, pas du cycle

**Problème.** L'ancien modèle interdisait la polyculture, pratique
courante (tilapia + clarias dans le même étang).

**Choix.** Modèle `Lot` : une espèce, un effectif, un coût unitaire, une
date de mise en charge. Plusieurs lots par cycle. `Cycle.especeId` reste,
facultatif, comme espèce dominante pour le filtrage et l'affichage.

**Coût.** Une jointure de plus partout. Les échantillons doivent porter
un `lotId` en polyculture — géré par une retombée sur le lot unique
quand il n'y en a qu'un (`indicateurs.ts:63`).

---

## D6 — Échantillons individuels conservés

**Problème.** Le tableur d'origine ne gardait que la moyenne d'une pêche
de contrôle.

**Choix.** Table `Echantillon` : `numero`, `nombre`, `poidsTotalG`.

**Coût.** Quatre colonnes et n lignes par pesée.

**Gain.** Coefficient de variation sans **aucune saisie
supplémentaire**, donc la décision de tri, et chez le clarias l'alerte
précoce au cannibalisme.

---

## D7 — Un seul cycle ouvert par infrastructure, garanti en base

**Problème.** Deux téléphones hors ligne peuvent ouvrir un cycle sur le
même bassin.

**Choix.** Index unique **partiel** PostgreSQL :
`WHERE dateCloture IS NULL AND deletedAt IS NULL`. Le langage Prisma ne
sait pas l'exprimer → migration SQL manuelle.

**Conséquence de conception.** Le rejet du second cycle est une **erreur
métier à afficher à l'agent**, pas un incident technique à contourner
par un retry. L'interface de synchronisation doit la présenter comme
telle.

---

## D8 — Dernière écriture gagne, mais rien n'est perdu

**Problème.** Deux profils (pisciculteur et encadreur) peuvent modifier
le même enregistrement hors ligne.

**Choix.** Résolution « last-write-wins » sur `updatedAt`, avec
journalisation systématique de la valeur écartée dans `ConflitSync`
(`valeurRejetee`, `valeurRetenue`, `raison`, `resolu`).

**Coût.** Une table qui grossit, et une interface de consultation à
écrire.

**Gain.** Une perte de donnée silencieuse est irrattrapable ; une perte
journalisée se répare.

---

## D9 — Dons et autoconsommation valorisés comme les ventes

**Problème.** Un pisciculteur qui nourrit sa famille apparaissait en
perte alors qu'il produit de la valeur.

**Choix.** `TypeRecolte` = `VENTE | DON | AUTOCONSOMMATION`, les trois
valorisés à `poidsKg × prixKg` dans le total des produits. Le prix de
vente moyen, lui, ne porte que sur les ventes.

**Effet de bord à connaître.** La rentabilité affichée n'est donc pas
une trésorerie. Un cycle peut être « rentable » sans qu'un franc soit
entré. À expliciter dans l'interface.

---

## D10 — Référentiels en base, rien en dur

**Problème.** Les taux de rationnement étaient enfouis dans les formules
du tableur — dont deux multiplications par zéro qui annulaient
silencieusement la ration des dernières pêches.

**Choix.** `Espece`, `TypeInfrastructure`, `Aliment`,
`ProduitSanitaire`, `PalierRationnement` sont des tables, administrées
depuis le back-office, répliquées en lecture seule sur mobile. Chaque
palier porte sa `source`.

**Gain.** Un paramètre faux se corrige sans redéploiement, et se
justifie devant un bailleur.

---

## D11 — Nomenclature FAO dès le schéma

**Problème.** Le projet vise un financement FAO ; les données doivent
être agrégeables au niveau national.

**Choix.** `MilieuFao` (FRESHWATER / BRACKISHWATER / MARICULTURE) et
`SystemeFao` (PONDS_TANKS, CAGES, PENS_ENCLOSURES, RACEWAYS_SILOS,
BARRAGES, RICE_FISH, RAFTS_ROPES_STAKES, HATCHERIES_NURSERIES) sur
`TypeInfrastructure`. `Espece.codeFao` en ASFIS 3 lettres.

**Règle stricte.** Un `codeFao` inconnu reste **vide**, jamais deviné :
un code faux agrégerait la production nationale sous la mauvaise
espèce. Seul `TLN` est renseigné aujourd'hui.

---

## D12 — Soft delete sur les tables de saisie

**Choix.** `deletedAt` sur les tables de saisie ; `actif: Boolean` sur
les référentiels.

**Raison.** Une suppression hors ligne doit se propager sans faire
disparaître une ligne qu'un autre appareil vient de modifier. Et les
index partiels de D7 s'appuient sur `deletedAt IS NULL`.

**Conséquence.** **Toute requête doit filtrer `deletedAt: null`.** Un
oubli fait réapparaître des lignes supprimées dans les indicateurs.
Prévoir une extension Prisma plutôt que de le répéter à la main.

---

## D13 — Les indicateurs sont une fonction pure

**Choix.** `calculerIndicateurs(d: CycleComplet)` reçoit l'agrégat
complet et ne lit rien elle-même. Aucun accès base, aucun I/O.

**Coût.** L'appelant doit charger tout le cycle avant d'appeler.

**Gain.** Testable sans base — `test/b4.ts` rejoue un cycle réel en
mémoire — et exécutable sur le téléphone à partir du cache local.

---

## D14 — La récolte prime sur l'estimation

**Problème.** L'ancien rapport renvoyait la biomasse estimée à la
dernière pêche et ignorait les ventes.

**Choix.** Si des récoltes portent un `nombre`, le poids moyen final
vient d'elles ; la production vient des récoltes pesées dès qu'il y en a.
L'estimation n'est qu'une retombée.

**Raison.** Des poissons pesés et comptés à la vente sont une mesure,
pas une estimation.

---

## D15 — Indice de consommation sur la production nette

**Choix.** `IC = aliment distribué / (production − biomasse initiale)`.

**Raison.** Le rapporter au poids brut flatte le résultat en créditant
l'élevage du poids des alevins mis en charge. C'est la définition de la
littérature, condition pour que les chiffres soient comparables à ceux
publiés ailleurs.

---

## D16 — Français et franc CFA d'abord, sans les coder en dur

**Problème.** L'application doit devenir bilingue (français, anglais) et
multidevise. Tout livrer d'emblée retarderait le reste ; ne rien prévoir
obligerait à fouiller chaque écran le jour venu.

**Choix.** On livre `fr` et `XOF` seuls, mais **aucun libellé ni symbole
monétaire n'est écrit dans un écran** :

- `apps/admin/src/i18n.ts` — dictionnaire, `t()`, `formaterMontant()`,
  `formaterNombre()`, `formaterDate()`. `fr` fait foi ; une clé absente
  d'une autre langue y retombe, donc on traduit sans casser d'écran.
- `GET /api/config` — langue et devise actives servies par l'API.
- Les erreurs de l'API portent un **code stable** (`CYCLE_DEJA_OUVERT`,
  `PALIER_TAUX_HORS_BORNES`…) en plus du message français : une interface
  anglaise traduit le code, elle n'analyse pas une phrase.
- Les champs monétaires sont typés `monnaie` dans la description des
  référentiels, pas `nombre` avec un « (F) » dans le libellé.

**Coût.** Un niveau d'indirection sur des textes qui n'ont pour l'instant
qu'une seule version.

**Gain.** Ajouter l'anglais devient mécanique : un dictionnaire de plus.

---

## D17 — Tailwind et des composants possédés, pas une bibliothèque

**Problème.** L'admin écrit à la main était fonctionnel mais laid, et D1
avait prévenu : pas d'admin « gratuit » comme Filament, l'interface se
construit.

**Choix.** Tailwind v4 et des composants façon **shadcn/ui** — jetons de
couleur en `oklch`, `cva` pour les variantes, `cn()` pour fusionner les
classes. Les composants vivent dans `apps/admin/src/composants/ui/`,
**dans le dépôt** : on les modifie comme n'importe quel fichier.

Écrits à la main plutôt qu'installés par l'outil `shadcn` : celui-ci est
interactif et tire des primitives Radix dont on n'a pas besoin ici. Les
`select` et cases à cocher restent **natifs** — plus utilisables au
clavier avec beaucoup d'options, et pilotables en test.

**Coût.** Ces composants sont à nous : aucune mise à jour ne viendra les
corriger.

**Gain.** Aucun thème imposé, rien à contourner, et le poids reste faible.

**Conséquence.** Les tests de bout en bout s'accrochent à des attributs
`data-test`, jamais à des classes : l'interface a été entièrement
réécrite sans qu'un seul contrôle ne tombe.

---

## D18 — JWT court, jeton de rafraîchissement long et tournant

**Problème.** Un pisciculteur peut rester des semaines sans réseau. Une
session qui expire hors ligne lui ferait perdre l'accès à sa propre
saisie, ou pousserait à des jetons d'accès valables des mois.

**Choix.** Jeton d'accès JWT de **15 minutes** (HS256, `JWT_SECRET`),
porté en `Authorization: Bearer`. Jeton de rafraîchissement **opaque**,
valable **90 jours glissants**, stocké en base sous forme d'empreinte
SHA-256 (`JetonRafraichissement`), rattaché à un `Appareil`. Chaque
rafraîchissement **le remplace** ; présenter un jeton déjà remplacé
révoque toute sa famille (vol présumé) — sauf dans les 60 secondes qui
suivent, pour qu'une réponse perdue sur un réseau instable ne
déconnecte pas l'utilisateur. Mots de passe : `scrypt` de `node:crypto`,
aucune dépendance native à compiler.

Hors ligne, **aucun jeton n'est exigé** : l'application lit et écrit sa
base locale. Le jeton ne sert qu'à la synchronisation, et 90 jours
couvrent une saison de terrain.

Les jetons voyagent dans le corps des réponses, pas en cookie : l'API,
l'admin et la PWA peuvent vivre sur des domaines différents.

**Coût.** Le client garde le jeton de rafraîchissement en IndexedDB :
une faille XSS le rendrait lisible. Contrepartie : politique de sécurité
du contenu stricte sur la PWA, et révocation par appareil.

**Droits.** `AccesFerme` borne tout : un pisciculteur ne voit que ses
fermes, un encadreur celles qui lui sont affectées, `REGION` et
`SECTEUR` lisent leur région, `NATIONAL` lit tout, seul `ADMIN` écrit
les référentiels. Le filtre est appliqué **dans le service**, pas laissé
au bon vouloir de chaque route.

---

## D19 — Mobile en PWA installable, pas en React Native

**Problème.** L'application doit s'installer chez des particuliers, sur
des téléphones Android d'entrée de gamme, sans passer par un magasin
d'applications ni par un encadreur.

**Choix.** Une **PWA** : installable depuis le navigateur, mise à jour à
l'ouverture, hors ligne par service worker. Base locale en **IndexedDB**
(via Dexie), qui remplace WatermelonDB. Les calculs restent ceux de
`@aqua/shared` (D1), exécutés dans le navigateur.

**Inscription libre.** Un particulier crée son compte lui-même, par
**numéro de téléphone** et mot de passe — l'e-mail est facultatif, il
est rare sur le terrain. Il obtient le rôle `PISCICULTEUR` et devient
`PROPRIETAIRE` de chaque ferme qu'il crée. Les rôles d'encadrement ne
s'obtiennent que par un administrateur.

**Coût.** Pas d'accès aux API natives réservées aux applications (tâche
de fond garantie, Bluetooth de certaines balances). Sur iOS, le stockage
d'une PWA peut être purgé après plusieurs semaines d'inutilisation — d'où
une synchronisation dès que le réseau revient, pas à la demande.

**Gain.** Un seul code d'interface web avec l'admin, et zéro friction
d'installation.

---

## D20 — Contrôles de saisie dans `@aqua/shared`, contexte chargé par l'appelant

**Problème.** Rien n'empêchait une pesée datée d'avant la mise en charge,
plus de morts que de poissons, deux cycles qui se chevauchent dans un
bassin, un cycle « bouclé » sans date de clôture, ou un pH de 72.

**Choix.** `packages/shared/src/controles.ts` : des fonctions pures qui
renvoient des violations à **code stable**. Elles ne lisent rien ; l'API
charge le contexte (bornes du cycle, effectifs, cycles voisins —
`saisie/controles.service.ts`) et la PWA le lira dans IndexedDB. Refus
en **422** avec `code`, `message` et la liste `violations`.

Règles notables : toute opération tombe entre mise en charge et clôture
(une dépense de préparation peut précéder la charge) ; pas de date au-delà
de demain (fuseaux) ; mortalités et récoltes bornées par l'effectif ;
statut et date de clôture concordent — l'API **déduit** le statut quand
seule la date est fournie ; cycles, pesées et échantillons **numérotés**
par l'API quand le numéro manque.

**Coût.** Les contraintes SQL restent (défense en profondeur) : certaines
règles existent donc deux fois. Seules les règles sur une ligne isolée
vont en base ; celles qui demandent le contexte restent dans `shared`.

**Non retenu.** Refuser une récolte dans le délai d'attente : la récolte
a eu lieu, il faut l'enregistrer. Elle reste signalée non conforme
(étape 8, alerte).

---

## D21 — Protocole de synchronisation

**Problème.** Un curseur fondé sur l'heure perd des lignes, une
résolution fondée sur l'horloge du téléphone se fait tromper par un
appareil mal réglé, et un lot refusé en bloc pour une seule ligne fautive
bloque un agent qui revient de trois jours de terrain.

**Choix.**
- **Pull** par ferme lisible (tranche la question « par ferme ou par
  cycle »). Curseur = heure serveur du pull ; le suivant relit **une
  minute de recouvrement** pour rattraper les transactions validées en
  retard — le client écrit par identifiant, les doublons sont sans effet.
  Suppressions dans `supprimes`. Une ferme confiée après le curseur
  (`AccesFerme.createdAt`) est envoyée en entier.
- **Push** : liste ordonnée `{ ressource, id, operation, donnees,
  versionBase, modifieLe }`. Chaque ligne passe par les mêmes droits,
  règles dérivées et contrôles que l'API REST, et reçoit son propre
  statut : `applique`, `conflit` (avec `gagnant`) ou `rejete` (avec `code`).
- **Détection** d'un conflit par **version** : l'`updatedAt` vu au pull
  (`versionBase`) est antérieur à celui du serveur. Indépendant des horloges.
- **Résolution** (D8) : la modification la plus récente gagne, l'heure du
  téléphone étant **bornée à celle du serveur**. La valeur écartée va
  dans `ConflitSync`, avec l'appareil. Un push rejoué à l'identique n'est
  pas un conflit. Une suppression plus ancienne qu'une modification
  s'efface devant elle ; écrire sur une ligne supprimée est refusé
  (`LIGNE_SUPPRIMEE`) et journalisé.
- `createdAt`/`updatedAt`/`deletedAt` ne sont **jamais** acceptés du
  client, ni en REST ni en push : un `updatedAt` antidaté cacherait la
  ligne au pull.

**Coût.** Un pull après chaque push renvoie au client ses propres lignes.
Pas de pagination : un profil national qui synchroniserait tout le pays
recevrait tout d'un bloc — la PWA vise les fermes d'un utilisateur.
Retirer l'accès à une ferme ne l'efface pas du téléphone.

---

## D22 — Alertes : une fonction pure dans `shared`, jamais bloquantes

**Problème.** Les seuils existaient en base sans que rien ne les lise ; et
l'alerte qui compte le plus — l'oxygène à l'aube — doit apparaître au bord
du bassin, sans réseau.

**Choix.** `calculerAlertes(cycle, { aujourdhui, mesures })` dans
`@aqua/shared` (D1), sur le même agrégat que les indicateurs (D13). Trois
niveaux : `critique`, `attention`, `info`, avec un message qui dit **quoi
faire**. Seuils lus sur l'espèce (D10) ; le seuil de coefficient de
variation devient une colonne (`seuilHeterogeneitePct`), 25 % par défaut
— valeur usuelle en pisciculture, à affiner espèce par espèce dans l'admin.

Une alerte **ne bloque jamais** une saisie : une récolte faite pendant un
délai d'attente a eu lieu, il faut l'enregistrer — elle ressort en
critique jusqu'au bilan.

**Coût.** `GET /alertes` recalcule chaque cycle en cours (300 au plus) :
suffisant pour une région, pas pour un tableau de bord national, qui
demanderait des alertes matérialisées.

---

## D23 — La simulation est un cycle fictif, chiffré comme un vrai

**Problème.** Un modèle de projection à part aurait ses propres formules
de prix de revient ; au premier écart avec le bilan réel, personne ne
saurait lequel croire.

**Choix.** `simuler()` construit un `CycleComplet` fictif — alevins,
mortalités au taux de référence, aliment à l'indice de référence, récolte
**comptée** au poids visé (D14) — puis appelle `calculerIndicateurs`.
Densité par défaut : 80 % du maximum de l'espèce ; poids visé par défaut :
milieu de la fourchette marchande ; chaque valeur par défaut est rendue
comme **hypothèse** lisible. Le calcul tourne aussi dans la PWA : un
particulier chiffre son projet sans réseau.

**Coût.** La projection est aussi bonne que les repères de l'espèce ;
ils sont en base (D10), donc corrigibles sans redéploiement.

---

## Décisions en attente

- **Devise de stockage — non tranché, et ce n'est pas du formatage.**
  D16 ne règle que l'affichage. Les montants sont stockés **sans devise**,
  donc implicitement en XOF, et `packages/shared/src/types.ts` documente
  « montants → francs CFA entiers ». Une seconde devise oblige à choisir :
  une devise par ferme (simple, mais interdit de consolider deux fermes
  sans taux), une devise par ligne avec le taux figé à la saisie (seul
  moyen de garder juste une charge passée, coût : une colonne et un taux
  sur chaque table d'argent), ou un stockage en devise pivot (les
  montants saisis ne se relisent plus tels quels). **À trancher avant
  d'ajouter la moindre devise** : les trois demandent une migration
  différente, et la troisième réécrit des données existantes.
- **Vérification du téléphone à l'inscription.** Aujourd'hui aucune
  (D19). Un code par SMS suppose un fournisseur et un coût par envoi.
- **Mot de passe oublié.** Sans e-mail ni SMS, seul un administrateur
  peut réinitialiser.
