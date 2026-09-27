import { Link } from 'react-router';
import { Calculator, Plus, UserRound } from 'lucide-react';
import { db } from '../db';
import { useRequete } from '../donnees';
import { utilisateur } from '../session';
import { Entete } from '../App';
import { buttonVariants } from '@/ui/button';
import { Carte, Section, Vide } from './liste';

/// Identifiants ayant une saisie pas encore acceptée par le serveur.
export function useEnAttente() {
  return useRequete(async () => new Set((await db.journal.toArray()).map((e) => e.id))) ?? new Set<string>();
}

export function Fermes() {
  const moi = utilisateur();
  const fermes = useRequete(() => db.fermes.orderBy('id').toArray());
  const bassins = useRequete(() => db.infrastructures.toArray());
  const enAttente = useEnAttente();

  return (
    <>
      <Entete
        titre="Mes fermes"
        sousTitre={[moi?.prenom, moi?.nom].filter(Boolean).join(' ')}
        action={
          <Link to="/compte" aria-label="Mon compte" data-test="compte" className="rounded-md p-2 text-muted-foreground hover:bg-accent">
            <UserRound className="size-5" />
          </Link>
        }
      />
      <Section
        titre="Fermes"
        action={
          <Link to="/saisie/fermes/nouveau" data-test="nouvelle-ferme" className={buttonVariants({ size: 'sm' })}>
            <Plus /> Ferme
          </Link>
        }
      >
        {fermes?.length === 0 && <Vide>Commencez par créer votre ferme : ses bassins et ses cycles viendront ensuite.</Vide>}
        {fermes
          ?.sort((a, b) => String(a['nom']).localeCompare(String(b['nom']), 'fr'))
          .map((f) => {
            const n = bassins?.filter((b) => b['fermeId'] === f.id).length ?? 0;
            return (
              <Carte
                key={f.id}
                vers={`/fermes/${f.id}`}
                test="ferme"
                titre={f['nom']}
                detail={`${n} bassin${n > 1 ? 's' : ''}${f['village'] ? ` · ${f['village']}` : ''}`}
                enAttente={enAttente.has(f.id)}
              />
            );
          })}
      </Section>
      <Link to="/simuler" data-test="lien-simuler" className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
        <Calculator /> Simuler un projet
      </Link>
    </>
  );
}
