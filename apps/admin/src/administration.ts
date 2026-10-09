/// Ressources d'administration (étape 6), réservées au rôle ADMIN : comptes
/// et affectations aux fermes. Mêmes écrans génériques que les référentiels.

import type { Ressource } from './description';

export const ROLES = ['PISCICULTEUR', 'ENCADREUR', 'SECTEUR', 'REGION', 'NATIONAL', 'ADMIN'] as const;

export const UTILISATEURS: Ressource = {
  nom: 'admin/utilisateurs',
  chemin: 'utilisateurs',
  libelle: 'Utilisateurs',
  libelleSingulier: 'utilisateur',
  description:
    'Les particuliers s’inscrivent seuls, comme pisciculteurs. Les rôles d’encadrement et de consultation territoriale se donnent ici. Désactiver coupe les sessions ; rien n’est supprimé, les saisies gardent leur auteur.',
  triDefaut: 'nom',
  champs: [
    { nom: 'nom', libelle: 'Nom', type: 'texte', requis: true, enListe: true },
    { nom: 'prenom', libelle: 'Prénom', type: 'texte', enListe: true },
    { nom: 'telephone', libelle: 'Téléphone', type: 'texte', enListe: true, aide: 'Identifiant de connexion, avec l’e-mail.' },
    { nom: 'email', libelle: 'E-mail', type: 'texte' },
    { nom: 'role', libelle: 'Rôle', type: 'enum', options: ROLES, requis: true, enListe: true },
    {
      nom: 'regionId',
      libelle: 'Région / district',
      type: 'relation',
      ressourceLiee: 'geographie/regions',
      enListe: true,
      aide: 'Portée d’un profil SECTEUR ou REGION : il lit toutes les fermes de sa région.',
    },
    {
      nom: 'motDePasse',
      libelle: 'Mot de passe',
      type: 'motDePasse',
      aide: 'Obligatoire à la création. En modification, laisser vide pour le garder ; le changer coupe les sessions ouvertes.',
    },
    { nom: 'actif', libelle: 'Actif', type: 'booleen', enListe: true },
  ],
};

export const ACCES: Ressource = {
  nom: 'admin/acces',
  chemin: 'acces',
  libelle: 'Affectations',
  libelleSingulier: 'affectation',
  description:
    'Qui travaille sur quelle ferme. Un encadreur ne voit et ne saisit que les fermes qui lui sont confiées ; le retrait prend effet immédiatement, et à sa prochaine synchronisation il reçoit toute ferme nouvellement confiée.',
  triDefaut: 'createdAt',
  ordreDefaut: 'desc',
  champs: [
    { nom: 'userId', libelle: 'Utilisateur', type: 'relation', ressourceLiee: 'admin/utilisateurs', requis: true, enListe: true },
    { nom: 'fermeId', libelle: 'Ferme', type: 'relation', ressourceLiee: 'saisie/fermes', requis: true, enListe: true },
    { nom: 'niveau', libelle: 'Niveau', type: 'enum', options: ['PROPRIETAIRE', 'ENCADREUR', 'LECTURE'], requis: true, enListe: true },
    { nom: 'debutLe', libelle: 'Du', type: 'date', enListe: true },
    { nom: 'finLe', libelle: 'Au', type: 'date', enListe: true, aide: 'Vide : sans fin. Une affectation échue ne donne plus aucun droit.' },
  ],
};

export const ADMINISTRATION: Ressource[] = [UTILISATEURS, ACCES];
