import { useParams } from 'react-router';
import { parChemin } from '@/ressources';
import { TableauRessource } from '@/composants/TableauRessource';

/// Page de liste d'une ressource de premier niveau : référentiels et fermes.
/// Les ressources filles (pesées, lots…) n'ont pas de page à elles — elles
/// s'affichent dans la fiche de leur parent.
export function ListeRessource({ base }: { base: 'referentiels' | 'fermes' | 'administration' }) {
  const { ressource: segment } = useParams();
  const chemin = base === 'fermes' ? 'fermes' : (segment ?? '');
  const ressource = parChemin(chemin);

  if (!ressource) return <p>Ressource inconnue.</p>;

  const racine = base === 'fermes' ? '/fermes' : `/${base}/${ressource.chemin}`;
  // Les fermes ont une fiche ; un référentiel se modifie directement.
  const lienLigne = (id: string) => (base === 'fermes' ? `/fermes/${id}` : `${racine}/${id}`);

  return (
    <>
      <h2 className="mb-1 text-2xl font-semibold tracking-tight">{ressource.libelle}</h2>
      <p className="mb-6 max-w-[70ch] text-sm text-muted-foreground">{ressource.description}</p>

      <TableauRessource
        ressource={ressource}
        cheminNouveau={`${racine}/nouveau`}
        lienLigne={lienLigne}
        libelleLien={base === 'fermes' ? 'Ouvrir' : undefined}
        avecRecherche={base === 'referentiels'}
      />
    </>
  );
}
