import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { parChemin } from '@/ressources';
import { t } from '@/i18n';
import { FormulaireRessource } from '@/composants/FormulaireRessource';

/// Page de création ou de modification. Le parent arrive en paramètre d'URL
/// (`?cycleId=…`) : on revient ensuite d'où l'on vient, pas sur une liste
/// plate qui n'existe pas pour les ressources filles.
export function PageFormulaire({
  base,
  chemin,
}: {
  base: 'referentiels' | 'saisie' | 'administration';
  /// Imposé quand la route ne porte pas de paramètre `:ressource`
  /// — `/fermes/nouveau`, par exemple.
  chemin?: string;
}) {
  const { ressource: segment, id } = useParams();
  const [parametres] = useSearchParams();
  const navigate = useNavigate();
  const ressource = parChemin(chemin ?? segment ?? '');

  if (!ressource) return <p>Ressource inconnue.</p>;

  const creation = id === undefined || id === 'nouveau';

  const contexte: Record<string, string> = {};
  const champParent = ressource.parent?.champ;
  const valeurParent = champParent ? parametres.get(champParent) : null;
  if (champParent && valeurParent) contexte[champParent] = valeurParent;

  const retour = parametres.get('retour');
  const destination =
    retour ??
    (base === 'saisie' ? '/fermes' : `/${base}/${ressource.chemin}`);
  const revenir = () => navigate(destination);

  return (
    <>
      <button
        type="button"
        onClick={revenir}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('action.retour')}
      </button>

      <h2 className="mb-6 text-2xl font-semibold tracking-tight">
        {creation
          ? `${t('form.nouvelle')} — ${ressource.libelleSingulier}`
          : `${t('action.modifier')} — ${ressource.libelleSingulier}`}
      </h2>

      <FormulaireRessource
        ressource={ressource}
        {...(creation ? {} : { id })}
        contexte={contexte}
        apresEnregistrement={revenir}
        onAnnuler={revenir}
      />
    </>
  );
}
