import { useOne } from '@refinedev/core';
import { Link, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import type { Ressource } from '@/description';
import { champsEnListe } from '@/description';
import {
  CYCLES,
  ECHANTILLONS,
  FERMES,
  INFRASTRUCTURES,
  LOTS,
  MORTALITES,
  PESEES,
} from '@/saisie';
import { formaterDate, formaterMontant, formaterNombre, t } from '@/i18n';
import { Button } from '@/composants/ui/button';
import { Card } from '@/composants/ui/divers';
import { TableauRessource } from '@/composants/TableauRessource';

/// Fiche d'une ligne « parent » : son résumé, puis la liste de ses enfants.
/// Ferme → infrastructures, infrastructure → cycles, pesée → échantillons,
/// lot → mortalités. Quatre écrans, une seule implémentation.
interface Configuration {
  parent: Ressource;
  enfant: Ressource;
  cleEnfant: string;
  /// Fabrique le lien vers la fiche ou le formulaire d'un enfant.
  lienEnfant: (idEnfant: string, idParent: string) => string;
  libelleLienEnfant?: string;
  /// Chemin de retour, calculé depuis la ligne chargée.
  retour: (ligne: Record<string, unknown>) => { chemin: string; libelle: string };
  titre: (ligne: Record<string, unknown>) => string;
}

const CONFIGURATIONS: Record<string, Configuration> = {
  fermes: {
    parent: FERMES,
    enfant: INFRASTRUCTURES,
    cleEnfant: 'fermeId',
    lienEnfant: (idEnfant) => `/infrastructures/${idEnfant}`,
    libelleLienEnfant: 'Ouvrir',
    retour: () => ({ chemin: '/fermes', libelle: FERMES.libelle }),
    titre: (l) => String(l['nom'] ?? ''),
  },
  infrastructures: {
    parent: INFRASTRUCTURES,
    enfant: CYCLES,
    cleEnfant: 'infrastructureId',
    lienEnfant: (idEnfant) => `/cycles/${idEnfant}`,
    libelleLienEnfant: 'Ouvrir',
    retour: (l) => ({
      chemin: `/fermes/${String(l['fermeId'] ?? '')}`,
      libelle: (l['ferme'] as { nom?: string } | undefined)?.nom ?? FERMES.libelle,
    }),
    titre: (l) => String(l['nom'] ?? ''),
  },
  pesees: {
    parent: PESEES,
    enfant: ECHANTILLONS,
    cleEnfant: 'peseeId',
    lienEnfant: (idEnfant, idParent) =>
      `/saisie/echantillons/${idEnfant}?retour=${encodeURIComponent(`/pesees/${idParent}`)}`,
    retour: (l) => ({ chemin: `/cycles/${String(l['cycleId'] ?? '')}`, libelle: 'Cycle' }),
    titre: (l) => `Pesée n° ${String(l['numero'] ?? '')}`,
  },
  lots: {
    parent: LOTS,
    enfant: MORTALITES,
    cleEnfant: 'lotId',
    lienEnfant: (idEnfant, idParent) =>
      `/saisie/mortalites/${idEnfant}?retour=${encodeURIComponent(`/lots/${idParent}`)}`,
    retour: (l) => ({ chemin: `/cycles/${String(l['cycleId'] ?? '')}`, libelle: 'Cycle' }),
    titre: (l) => {
      const espece = (l['espece'] as { nom?: string } | undefined)?.nom;
      return espece ? `Lot — ${espece}` : 'Lot';
    },
  },
};

function valeurResumee(ligne: Record<string, unknown>, champ: (typeof FERMES.champs)[number]) {
  if (champ.type === 'relation') {
    const cle = champ.nom.endsWith('Id') ? champ.nom.slice(0, -2) : champ.nom;
    const liee = ligne[cle] as { nom?: string } | undefined;
    return liee?.nom ?? t('valeur.vide');
  }
  const valeur = ligne[champ.nom];
  if (valeur === null || valeur === undefined || valeur === '') return t('valeur.vide');
  if (champ.type === 'booleen') return t(valeur ? 'valeur.oui' : 'valeur.non');
  if (champ.type === 'date') return formaterDate(String(valeur));
  if (champ.type === 'monnaie') return formaterMontant(Number(valeur));
  if (champ.type === 'nombre' || champ.type === 'entier') return formaterNombre(Number(valeur));
  return String(valeur);
}

export function FicheParent({ type }: { type: keyof typeof CONFIGURATIONS }) {
  const { id = '' } = useParams();
  const config = CONFIGURATIONS[type]!;
  const requete = useOne({ resource: config.parent.nom, id });
  const ligne = (requete.data?.data ?? {}) as Record<string, unknown>;

  const retour = config.retour(ligne);
  const cheminActuel = `/${config.parent.chemin}/${id}`;

  return (
    <>
      <Link
        to={retour.chemin}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {retour.libelle}
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">{config.titre(ligne)}</h2>
        <Link
          to={`/saisie/${config.parent.chemin}/${id}?retour=${encodeURIComponent(cheminActuel)}`}
          className="ml-auto"
        >
          <Button variant="outline" size="sm">
            {t('action.modifier')}
          </Button>
        </Link>
      </div>

      <Card className="mb-8 grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-4">
        {champsEnListe(config.parent).map((champ) => (
          <div key={champ.nom}>
            <div className="text-xs text-muted-foreground">{champ.libelle}</div>
            <div className="tabulaire mt-0.5 text-sm font-medium">
              {valeurResumee(ligne, champ)}
            </div>
          </div>
        ))}
      </Card>

      <section>
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {config.enfant.libelle}
        </h3>
        <p className="mb-3 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
          {config.enfant.description}
        </p>
        <TableauRessource
          ressource={config.enfant}
          filtres={{ [config.cleEnfant]: id }}
          compact
          cheminNouveau={`/saisie/${config.enfant.chemin}/nouveau?${config.cleEnfant}=${id}&retour=${encodeURIComponent(cheminActuel)}`}
          lienLigne={(idEnfant) => config.lienEnfant(idEnfant, id)}
          {...(config.libelleLienEnfant ? { libelleLien: config.libelleLienEnfant } : {})}
        />
      </section>
    </>
  );
}
