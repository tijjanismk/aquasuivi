import { Link } from 'react-router';
import { RotateCcw } from 'lucide-react';
import { db, type EntreeJournal } from '../db';
import { useRequete } from '../donnees';
import { FORMULAIRES } from '../formulaires';
import { abandonner, reessayer } from '../saisie';
import { Entete } from '../App';
import { Button, stylesBouton } from '@/ui/button';
import { Card } from '@/ui/divers';
import { Vide } from './liste';

/// Où corriger une saisie refusée : le formulaire de la ligne, avec son cycle.
async function lien(e: EntreeJournal): Promise<string | null> {
  if (e.operation === 'supprimer') return null;
  if (e.ressource === 'pesees') return `/pesees/${e.id}`;
  if (e.ressource === 'echantillons') {
    const ech = await db.echantillons.get(e.id);
    return ech ? `/pesees/${ech['peseeId']}` : null;
  }
  return `/saisie/${e.ressource}/${e.id}`;
}

/// Saisies refusées par le serveur à la synchronisation (D21) : un cycle déjà
/// ouvert par l'encadreur, une date hors du cycle… L'agent corrige, ou abandonne
/// sa version pour reprendre celle du serveur.
export function Corrections() {
  const rejets = useRequete(async () => {
    const liste = await db.journal.where('etat').equals('rejete').toArray();
    return Promise.all(liste.map(async (e) => ({ e, lien: await lien(e) })));
  });

  return (
    <>
      <Entete titre="À corriger" retour="/" />
      {rejets?.length === 0 && <Vide>Rien à corriger : tout est parti.</Vide>}
      <div className="flex flex-col gap-2">
        {rejets?.map(({ e, lien: vers }) => (
          <Card key={e.seq} data-test="rejet" className="p-4">
            <div className="text-sm font-medium">
              {FORMULAIRES[e.ressource].titre.replace(/^Nouve(au|lle) /, '')}
              {e.operation === 'supprimer' && ' — suppression'}
            </div>
            <p data-test="motif" className="mt-1 text-sm text-destructive">{e.message}</p>
            <div className="mt-3 flex gap-2">
              {vers && (
                <Link to={vers} className={stylesBouton({ size: 'sm' })}>Corriger</Link>
              )}
              <Button
                size="sm"
                variant="outline"
                data-test="abandonner"
                onClick={() => {
                  if (confirm('Abandonner cette saisie ? La version du serveur sera reprise.')) void abandonner(e);
                }}
              >
                Abandonner
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {!!rejets?.length && (
        <Button variant="ghost" className="mt-4 w-full" onClick={() => void reessayer()}>
          <RotateCcw /> Tout renvoyer
        </Button>
      )}
    </>
  );
}
