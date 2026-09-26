/// Socle de description des écrans. Listes et formulaires sont engendrés à
/// partir d'ici : ajouter une colonne au schéma Prisma = ajouter une ligne
/// dans une description, pas écrire un écran.

export type TypeChamp =
  | 'texte'
  | 'texteLong'
  | 'nombre'
  | 'entier'
  | 'monnaie'
  | 'date'
  | 'booleen'
  | 'enum'
  | 'relation'
  /// Saisi masqué, jamais relu : l'API ne renvoie pas les mots de passe.
  | 'motDePasse';

export interface Champ {
  nom: string;
  libelle: string;
  type: TypeChamp;
  requis?: boolean;
  options?: readonly string[];
  /// Ressource cible d'un champ `relation`, par son `nom` d'API.
  ressourceLiee?: string;
  /// Champ à afficher pour la ligne liée (défaut : `nom`).
  libelleLie?: string;
  /// Liste en cascade : les options sont filtrées par la valeur de ce champ
  /// (même nom de colonne côté API), et vidées quand il change.
  dependDe?: string;
  /// Visible dans le tableau de liste. Les autres n'apparaissent qu'au formulaire.
  enListe?: boolean;
  aide?: string;
  /// Rempli par l'API et non saisissable — géométrie, délai d'attente…
  calcule?: boolean;
}

export interface Ressource {
  /// Nom Refine — sert aussi de chemin d'API sous `/api/`.
  nom: string;
  /// Segment d'URL de l'admin.
  chemin: string;
  libelle: string;
  /// Utilisé dans « Nouvelle pesée », « Modifier le lot »…
  libelleSingulier: string;
  description: string;
  /// Colonne de tri initiale. Tous les référentiels n'ont pas de `nom` —
  /// un palier n'en a pas, et trier dessus fait échouer la requête.
  triDefaut: string;
  ordreDefaut?: 'asc' | 'desc';
  champs: Champ[];
  /// Ressource dont celle-ci dépend, et clé étrangère qui les relie.
  /// Une pesée n'existe que dans un cycle : on ne liste jamais « toutes les
  /// pesées », on liste celles d'un cycle.
  parent?: { ressource: string; champ: string };
}

export function champsEnListe(ressource: Ressource): Champ[] {
  return ressource.champs.filter((c) => c.enListe);
}

/// Les champs qu'un formulaire propose : ni les calculés, ni la clé du parent
/// (elle vient du contexte, la redemander serait une source d'erreur).
export function champsSaisissables(ressource: Ressource): Champ[] {
  return ressource.champs.filter(
    (c) => !c.calcule && c.nom !== ressource.parent?.champ,
  );
}
