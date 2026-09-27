import { Link, useParams } from 'react-router';
import { Pencil, Plus } from 'lucide-react';
import { db } from '../db';
import { useRequete } from '../donnees';
import { nombre } from '../format';
import { Entete } from '../App';
import { buttonVariants } from '@/ui/button';
import { Carte, Section, Vide } from './liste';
import { useEnAttente } from './Fermes';
import { Badge } from '@/ui/badge';

export function Ferme() {
  const { id = '' } = useParams();
  const ferme = useRequete(() => db.fermes.get(id), [id]);
  const bassins = useRequete(() => db.infrastructures.where('fermeId').equals(id).toArray(), [id]);
  const ouverts = useRequete(async () => {
    const ids = (bassins ?? []).map((b) => b.id);
    const cycles = await db.cycles.where('infrastructureId').anyOf(ids).toArray();
    return new Set(cycles.filter((c) => !c['dateCloture']).map((c) => c['infrastructureId']));
  }, [bassins]);
  const enAttente = useEnAttente();

  if (ferme === undefined) return null;
  if (!ferme) return <Vide>Ferme introuvable sur ce téléphone.</Vide>;

  return (
    <>
      <Entete
        titre={ferme['nom']}
        sousTitre={ferme['village'] ?? undefined}
        retour="/"
        action={
          <Link to={`/saisie/fermes/${id}`} aria-label="Modifier la ferme" className="rounded-md p-2 text-muted-foreground hover:bg-accent">
            <Pencil className="size-4" />
          </Link>
        }
      />
      <Section
        titre="Bassins"
        action={
          <Link to={`/saisie/infrastructures/nouveau?ferme=${id}`} data-test="nouveau-bassin" className={buttonVariants({ size: 'sm' })}>
            <Plus /> Bassin
          </Link>
        }
      >
        {bassins?.length === 0 && <Vide>Aucun bassin. Ajoutez-en un pour ouvrir un cycle.</Vide>}
        {bassins
          ?.sort((a, b) => String(a['nom']).localeCompare(String(b['nom']), 'fr', { numeric: true }))
          .map((b) => (
            <Carte
              key={b.id}
              vers={`/bassins/${b.id}`}
              test="bassin"
              titre={b['nom']}
              detail={
                b['superficie'] != null
                  ? `${nombre(b['superficie'])} m²${b['volume'] != null ? ` · ${nombre(b['volume'])} m³` : ''}`
                  : 'Dimensions à compléter'
              }
              droite={ouverts?.has(b.id) ? <Badge variant="secondary">Cycle en cours</Badge> : undefined}
              enAttente={enAttente.has(b.id)}
            />
          ))}
      </Section>
    </>
  );
}
