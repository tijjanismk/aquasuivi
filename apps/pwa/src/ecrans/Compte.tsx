import { useNavigate } from 'react-router';
import { LogOut } from 'lucide-react';
import { db } from '../db';
import { useRequete } from '../donnees';
import { deconnecter, utilisateur } from '../session';
import { Entete } from '../App';
import { Button } from '@/ui/button';
import { Alerte, Card } from '@/ui/divers';

export function Compte() {
  const naviguer = useNavigate();
  const moi = utilisateur();
  const nonEnvoyes = useRequete(() => db.journal.count()) ?? 0;

  const sortir = async () => {
    // Se déconnecter vide le téléphone (téléphone prêté) : une saisie non
    // envoyée serait perdue pour de bon.
    if (nonEnvoyes > 0 && !confirm(`${nonEnvoyes} saisie(s) ne sont pas encore envoyées et seront perdues. Se déconnecter quand même ?`)) return;
    await deconnecter();
    naviguer('/connexion', { replace: true });
  };

  return (
    <>
      <Entete titre="Mon compte" retour="/" />
      <Card className="mb-4 p-4 text-sm">
        <div className="font-medium">{[moi?.prenom, moi?.nom].filter(Boolean).join(' ')}</div>
        <div className="text-muted-foreground">{moi?.telephone}</div>
      </Card>
      {nonEnvoyes > 0 && (
        <Alerte className="mb-4">
          {nonEnvoyes} saisie(s) pas encore envoyée(s). Connectez-vous à un réseau avant de vous déconnecter.
        </Alerte>
      )}
      <Button variant="outline" className="w-full" data-test="deconnexion" onClick={() => void sortir()}>
        <LogOut /> Se déconnecter
      </Button>
    </>
  );
}
