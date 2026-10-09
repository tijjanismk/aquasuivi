import { Link, useParams } from 'react-router';
import { Pencil, Plus } from 'lucide-react';
import { db } from '../db';
import { useRequete } from '../donnees';
import { date } from '../format';
import { Entete } from '../App';
import { buttonVariants } from '@/ui/button';
import { Carte, Section, Vide } from './liste';
import { useEnAttente } from './Fermes';
import { Badge } from '@/ui/badge';

export function Bassin() {
  const { id = '' } = useParams();
  const bassin = useRequete(() => db.infrastructures.get(id), [id]);
  const cycles = useRequete(() => db.cycles.where('infrastructureId').equals(id).toArray(), [id]);
  const especes = useRequete(async () => new Map((await db.especes.toArray()).map((e) => [e.id, e['nom'] as string])));
  const enAttente = useEnAttente();

  if (bassin === undefined) return null;
  if (!bassin) return <Vide>Bassin introuvable sur ce téléphone.</Vide>;
  const ouvert = cycles?.some((c) => !c['dateCloture']);

  return (
    <>
      <Entete
        titre={`Bassin ${bassin['nom']}`}
        retour={`/fermes/${bassin['fermeId']}`}
        action={
          <Link to={`/saisie/infrastructures/${id}`} aria-label="Modifier le bassin" className="rounded-md p-2 text-muted-foreground hover:bg-accent">
            <Pencil className="size-4" />
          </Link>
        }
      />
      <Section
        titre="Cycles"
        action={
          !ouvert && (
            <Link to={`/saisie/cycles/nouveau?infrastructure=${id}`} data-test="nouveau-cycle" className={buttonVariants({ size: 'sm' })}>
              <Plus /> Ouvrir un cycle
            </Link>
          )
        }
      >
        {cycles?.length === 0 && <Vide>Aucun cycle. Ouvrez-en un le jour de la mise en charge.</Vide>}
        {cycles
          ?.sort((a, b) => (a['dateMiseEnCharge'] < b['dateMiseEnCharge'] ? 1 : -1))
          .map((c) => (
            <Carte
              key={c.id}
              vers={`/cycles/${c.id}`}
              test="cycle"
              titre={`Cycle ${c['numero'] ?? ''}`}
              detail={`${especes?.get(c['especeId']) ?? 'Espèce à préciser'} · depuis le ${date(c['dateMiseEnCharge'])}${c['dateCloture'] ? ` au ${date(c['dateCloture'])}` : ''}`}
              droite={<Badge variant={c['dateCloture'] ? 'muted' : 'secondary'}>{c['dateCloture'] ? 'Bouclé' : 'En cours'}</Badge>}
              enAttente={enAttente.has(c.id)}
            />
          ))}
      </Section>
    </>
  );
}
