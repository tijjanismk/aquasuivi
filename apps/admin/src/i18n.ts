/// Langue et formats. L'application doit devenir bilingue et multidevise ;
/// on livre le français et le franc CFA d'abord, mais **aucun libellé ni aucun
/// symbole monétaire ne doit être écrit en dur ailleurs qu'ici**. C'est la
/// seule chose qui rende l'ajout de l'anglais mécanique plutôt que fouillé.

export type Langue = 'fr' | 'en';
export type Devise = 'XOF';

export const LANGUE_PAR_DEFAUT: Langue = 'fr';
export const DEVISE_PAR_DEFAUT: Devise = 'XOF';

/// `fr` fait foi. Une clé absente d'une autre langue retombe dessus, ce qui
/// permet de traduire progressivement sans écran cassé.
const TEXTES = {
  fr: {
    'app.titre': 'Aqua-Suivi',
    'app.sousTitre': 'Administration',
    'nav.accueil': 'Accueil',
    'nav.deconnexion': 'Se déconnecter',
    'connexion.titre': 'Connexion',
    'connexion.identifiant': 'Téléphone ou e-mail',
    'connexion.motDePasse': 'Mot de passe',
    'connexion.valider': 'Se connecter',
    'connexion.refus': 'Connexion refusée.',
    'action.ajouter': 'Ajouter',
    'action.modifier': 'Modifier',
    'action.desactiver': 'Désactiver',
    'action.enregistrer': 'Enregistrer',
    'action.annuler': 'Annuler',
    'action.retour': 'Retour',
    'action.ouvrir': 'Ouvrir',
    'cycle.indicateurs': 'Indicateurs',
    'cycle.zootechnie': 'Zootechnie',
    'cycle.production': 'Production',
    'cycle.economie': 'Économie',
    'cycle.alimentation': 'Alimentation',
    'cycle.conformite': 'Conformité sanitaire',
    'cycle.sansIndicateurs':
      'Les indicateurs apparaîtront dès qu’un lot et une pesée seront saisis.',
    'cycle.recoltesNonConformes':
      '{n} récolte(s) dans un délai d’attente sanitaire.',
    'fiche.aucuneDonnee': 'Rien à afficher pour l’instant.',
    'action.precedent': 'Précédent',
    'action.suivant': 'Suivant',
    'liste.rechercher': 'Rechercher…',
    'liste.chargement': 'chargement…',
    'liste.vide': 'Aucune ligne pour l’instant.',
    'liste.page': 'Page {page} sur {total}',
    'liste.lignes': '{n} ligne(s)',
    'liste.confirmerDesactivation': 'Désactiver cette ligne ?',
    'form.nouvelle': 'Nouvelle entrée',
    'form.refus': 'Enregistrement refusé.',
    'erreur.apiInjoignable':
      'Impossible de joindre l’API. Vérifiez qu’elle tourne sur le port 3000.',
    'valeur.vide': '—',
    'valeur.oui': 'oui',
    'valeur.non': 'non',
  },
};

export type CleTexte = keyof (typeof TEXTES)['fr'];

/// `en` n'existe pas encore : la recherche retombe sur `fr`.
const PAR_LANGUE = TEXTES as Partial<Record<Langue, Partial<Record<CleTexte, string>>>>;

let langueActive: Langue = LANGUE_PAR_DEFAUT;
let deviseActive: Devise = DEVISE_PAR_DEFAUT;

export function configurer(langue: Langue, devise: Devise) {
  langueActive = langue;
  deviseActive = devise;
}

export function langue(): Langue {
  return langueActive;
}

export function t(cle: CleTexte, valeurs?: Record<string, string | number>): string {
  const modele = PAR_LANGUE[langueActive]?.[cle] ?? TEXTES.fr[cle] ?? cle;
  if (!valeurs) return modele;
  return modele.replace(/\{(\w+)\}/g, (_, nom: string) => String(valeurs[nom] ?? `{${nom}}`));
}

const ETIQUETTES_LANGUE: Record<Langue, string> = { fr: 'fr-FR', en: 'en-GB' };

export function formaterNombre(valeur: number): string {
  return new Intl.NumberFormat(ETIQUETTES_LANGUE[langueActive]).format(valeur);
}

/// Le franc CFA n'a pas de subdivision en usage : afficher des centimes
/// donnerait une fausse précision. Le jour où une devise à décimales arrive,
/// c'est ici que ça se règle, pas dans les écrans.
export function formaterMontant(valeur: number): string {
  return new Intl.NumberFormat(ETIQUETTES_LANGUE[langueActive], {
    style: 'currency',
    currency: deviseActive,
    maximumFractionDigits: deviseActive === 'XOF' ? 0 : 2,
  }).format(valeur);
}

/// Les dates de terrain arrivent en « AAAA-MM-JJ », sans heure ni fuseau : on
/// les met en forme sans jamais les faire passer par un fuseau local.
export function formaterDate(valeur: string): string {
  const [annee, mois, jour] = valeur.slice(0, 10).split('-');
  if (!annee || !mois || !jour) return valeur;
  return langueActive === 'fr' ? `${jour}/${mois}/${annee}` : `${annee}-${mois}-${jour}`;
}
