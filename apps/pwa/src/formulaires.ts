import { aujourdhui } from '@aqua/shared';
import { db, type Ligne, type Segment } from './db';

/// Formulaires de terrain. Peu de champs, les plus fréquents d'abord : sur le
/// bord d'un bassin, on saisit d'une main. Tout le reste reste modifiable
/// depuis l'administration.

export type TypeChamp = 'texte' | 'nombre' | 'entier' | 'date' | 'heure' | 'choix' | 'reference';

export interface Option {
  valeur: string;
  libelle: string;
}

export interface Contexte {
  /// Ligne parente, quand le formulaire s'ouvre depuis elle.
  cycle?: Ligne;
  infrastructure?: Ligne;
  ferme?: Ligne;
}

export interface Champ {
  nom: string;
  libelle: string;
  type: TypeChamp;
  requis?: boolean;
  unite?: string;
  aide?: string;
  options?: Option[];
  /// Choix lus dans IndexedDB (référentiels, lots du cycle…). `valeurs` : le
  /// formulaire en cours, pour les listes en cascade.
  charger?: (ctx: Contexte, valeurs: Record<string, string>) => Promise<Option[]>;
  /// Liste en cascade : rechargée, et vidée, quand ce champ change.
  dependDe?: string;
  defaut?: (ctx: Contexte) => unknown;
}

export interface Formulaire {
  titre: string;
  /// Champ qui rattache la ligne à son parent, rempli par l'écran.
  parent?: { champ: string; depuis: keyof Contexte };
  champs: Champ[];
}

const actifs = (lignes: Ligne[], libelle: (l: Ligne) => string = (l) => l['nom']) =>
  lignes
    .filter((l) => l['actif'] !== false)
    .map((l) => ({ valeur: l.id, libelle: libelle(l) }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));

const especes = async () => actifs(await db.especes.toArray());
const lotsDuCycle = async (ctx: Contexte) => {
  if (!ctx.cycle) return [];
  const lots = await db.lots.where('cycleId').equals(ctx.cycle.id).toArray();
  const noms = new Map((await db.especes.toArray()).map((e) => [e.id, e['nom'] as string]));
  return lots.map((l) => ({
    valeur: l.id,
    libelle: `${noms.get(l['especeId']) ?? 'Lot'} — ${l['nombre']} poissons du ${l['dateMiseEnCharge']}`,
  }));
};
const aujourdHui = () => aujourdhui();

export const FORMULAIRES: Record<Segment, Formulaire> = {
  fermes: {
    titre: 'Nouvelle ferme',
    champs: [
      { nom: 'nom', libelle: 'Nom de la ferme', type: 'texte', requis: true },
      { nom: 'promoteur', libelle: 'Promoteur', type: 'texte' },
      { nom: 'telephone', libelle: 'Téléphone', type: 'texte' },
      { nom: 'regionId', libelle: 'Région / district', type: 'reference', charger: async () => actifs(await db.regions.toArray()) },
      {
        nom: 'cercleId',
        libelle: 'Cercle',
        type: 'reference',
        dependDe: 'regionId',
        charger: async (_, v) => (v['regionId'] ? actifs(await db.cercles.where('regionId').equals(v['regionId']).toArray()) : []),
      },
      {
        nom: 'communeId',
        libelle: 'Commune',
        type: 'reference',
        dependDe: 'cercleId',
        charger: async (_, v) => (v['cercleId'] ? actifs(await db.communes.where('cercleId').equals(v['cercleId']).toArray()) : []),
      },
      { nom: 'village', libelle: 'Village', type: 'texte' },
    ],
  },
  infrastructures: {
    titre: 'Nouveau bassin',
    parent: { champ: 'fermeId', depuis: 'ferme' },
    champs: [
      { nom: 'nom', libelle: 'Nom', type: 'texte', requis: true, aide: 'Par exemple B4.' },
      {
        nom: 'typeInfrastructureId',
        libelle: 'Type',
        type: 'reference',
        requis: true,
        charger: async () => actifs(await db.typesInfrastructure.toArray()),
      },
      { nom: 'longueur', libelle: 'Longueur', type: 'nombre', unite: 'm' },
      { nom: 'largeur', libelle: 'Largeur', type: 'nombre', unite: 'm' },
      { nom: 'diametre', libelle: 'Diamètre (bac rond)', type: 'nombre', unite: 'm' },
      { nom: 'profondeur', libelle: 'Profondeur', type: 'nombre', unite: 'm' },
      { nom: 'niveauRemplissage', libelle: 'Remplissage', type: 'nombre', unite: '%', defaut: () => 100 },
    ],
  },
  cycles: {
    titre: 'Ouvrir un cycle',
    parent: { champ: 'infrastructureId', depuis: 'infrastructure' },
    champs: [
      { nom: 'dateMiseEnCharge', libelle: 'Mise en charge', type: 'date', requis: true, defaut: aujourdHui },
      { nom: 'especeId', libelle: 'Espèce principale', type: 'reference', charger: especes },
      { nom: 'observation', libelle: 'Observation', type: 'texte' },
    ],
  },
  lots: {
    titre: 'Mise en charge (alevins)',
    parent: { champ: 'cycleId', depuis: 'cycle' },
    champs: [
      { nom: 'especeId', libelle: 'Espèce', type: 'reference', requis: true, charger: especes, defaut: (c) => c.cycle?.['especeId'] },
      { nom: 'nombre', libelle: 'Nombre d’alevins', type: 'entier', requis: true },
      { nom: 'poidsMoyenG', libelle: 'Poids moyen', type: 'nombre', unite: 'g', requis: true },
      { nom: 'coutUnitaire', libelle: 'Prix par alevin', type: 'nombre', unite: 'F' },
      { nom: 'dateMiseEnCharge', libelle: 'Date', type: 'date', requis: true, defaut: (c) => c.cycle?.['dateMiseEnCharge'] ?? aujourdhui() },
    ],
  },
  mortalites: {
    titre: 'Mortalité',
    champs: [
      { nom: 'lotId', libelle: 'Lot', type: 'reference', requis: true, charger: lotsDuCycle },
      { nom: 'dateConstat', libelle: 'Date', type: 'date', requis: true, defaut: aujourdHui },
      { nom: 'nombre', libelle: 'Poissons morts', type: 'entier', requis: true },
      { nom: 'remplacement', libelle: 'Remplacés', type: 'entier', defaut: () => 0 },
      { nom: 'cause', libelle: 'Cause supposée', type: 'texte' },
    ],
  },
  pesees: {
    titre: 'Pêche de contrôle',
    parent: { champ: 'cycleId', depuis: 'cycle' },
    champs: [
      { nom: 'dateOperation', libelle: 'Date', type: 'date', requis: true, defaut: aujourdHui },
      { nom: 'tauxRationPct', libelle: 'Taux de ration retenu', type: 'nombre', unite: '%', aide: 'Laissez vide pour suivre la ration conseillée.' },
      { nom: 'observation', libelle: 'Observation', type: 'texte' },
    ],
  },
  echantillons: {
    titre: 'Échantillon',
    champs: [
      { nom: 'nombre', libelle: 'Poissons pesés', type: 'entier', requis: true },
      { nom: 'poidsTotalG', libelle: 'Poids total', type: 'nombre', unite: 'g', requis: true },
    ],
  },
  distributions: {
    titre: 'Aliment distribué',
    parent: { champ: 'cycleId', depuis: 'cycle' },
    champs: [
      { nom: 'alimentId', libelle: 'Aliment', type: 'reference', requis: true, charger: async () => actifs(await db.aliments.toArray()) },
      { nom: 'dateDebut', libelle: 'Du', type: 'date', requis: true, defaut: aujourdHui },
      { nom: 'dateFin', libelle: 'Au', type: 'date' },
      { nom: 'quantiteTotaleKg', libelle: 'Quantité', type: 'nombre', unite: 'kg', requis: true },
      { nom: 'prixKgApplique', libelle: 'Prix du kilo', type: 'nombre', unite: 'F', aide: 'Laissez vide pour le prix du référentiel.' },
    ],
  },
  traitements: {
    titre: 'Traitement sanitaire',
    parent: { champ: 'cycleId', depuis: 'cycle' },
    champs: [
      {
        nom: 'produitSanitaireId',
        libelle: 'Produit',
        type: 'reference',
        charger: async () => actifs(await db.produitsSanitaires.toArray()),
      },
      { nom: 'dateOperation', libelle: 'Date', type: 'date', requis: true, defaut: aujourdHui },
      { nom: 'quantite', libelle: 'Quantité', type: 'nombre' },
      { nom: 'prixUnitaire', libelle: 'Prix unitaire', type: 'nombre', unite: 'F' },
      { nom: 'motif', libelle: 'Motif', type: 'texte' },
    ],
  },
  recoltes: {
    titre: 'Récolte',
    parent: { champ: 'cycleId', depuis: 'cycle' },
    champs: [
      { nom: 'dateOperation', libelle: 'Date', type: 'date', requis: true, defaut: aujourdHui },
      {
        nom: 'type',
        libelle: 'Destination',
        type: 'choix',
        requis: true,
        defaut: () => 'VENTE',
        options: [
          { valeur: 'VENTE', libelle: 'Vente' },
          { valeur: 'DON', libelle: 'Don' },
          { valeur: 'AUTOCONSOMMATION', libelle: 'Consommation familiale' },
        ],
      },
      { nom: 'lotId', libelle: 'Lot', type: 'reference', charger: lotsDuCycle },
      { nom: 'poidsKg', libelle: 'Poids', type: 'nombre', unite: 'kg', requis: true },
      { nom: 'nombre', libelle: 'Nombre de poissons', type: 'entier', aide: 'Si vous les avez comptés : donne le poids moyen réel.' },
      { nom: 'prixKg', libelle: 'Prix du kilo', type: 'nombre', unite: 'F' },
    ],
  },
  depenses: {
    titre: 'Dépense',
    parent: { champ: 'cycleId', depuis: 'cycle' },
    champs: [
      {
        nom: 'categorie',
        libelle: 'Nature',
        type: 'choix',
        requis: true,
        defaut: () => 'AUTRE',
        options: [
          { valeur: 'MAIN_OEUVRE', libelle: 'Main-d’œuvre' },
          { valeur: 'EAU', libelle: 'Eau' },
          { valeur: 'ENERGIE', libelle: 'Énergie' },
          { valeur: 'TRANSPORT', libelle: 'Transport' },
          { valeur: 'AMORTISSEMENT', libelle: 'Amortissement' },
          { valeur: 'AUTRE', libelle: 'Autre' },
        ],
      },
      { nom: 'montant', libelle: 'Montant', type: 'nombre', unite: 'F', requis: true },
      { nom: 'dateOperation', libelle: 'Date', type: 'date', requis: true, defaut: aujourdHui },
      { nom: 'description', libelle: 'Détail', type: 'texte' },
    ],
  },
  'mesures-eau': {
    titre: 'Qualité de l’eau',
    champs: [
      { nom: 'dateMesure', libelle: 'Date', type: 'date', requis: true, defaut: aujourdHui },
      { nom: 'heure', libelle: 'Heure', type: 'heure', aide: 'L’oxygène se mesure au lever du jour.' },
      { nom: 'temperature', libelle: 'Température', type: 'nombre', unite: '°C' },
      { nom: 'oxygeneDissous', libelle: 'Oxygène dissous', type: 'nombre', unite: 'mg/L' },
      { nom: 'ph', libelle: 'pH', type: 'nombre' },
      { nom: 'transparenceSecchi', libelle: 'Transparence (Secchi)', type: 'entier', unite: 'cm' },
      { nom: 'observation', libelle: 'Observation', type: 'texte' },
    ],
  },
};
