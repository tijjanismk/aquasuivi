import { useNavigate } from 'react-router';
import { LogOut } from 'lucide-react';
import { db } from '../db';
import { useRequete } from '../donnees';
import { deconnecter, utilisateur } from '../session';
import { Entete } from '../App';
import { Button } from '@/ui/button';
import { Alert, AlertDescription } from '@/ui/alert';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/card';

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
      <Card className="mb-4 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-base">{[moi?.prenom, moi?.nom].filter(Boolean).join(' ')}</CardTitle>
          <CardDescription>{moi?.telephone}</CardDescription>
        </CardHeader>
      </Card>
      {nonEnvoyes > 0 && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            {nonEnvoyes} saisie(s) pas encore envoyée(s). Connectez-vous à un réseau avant de vous déconnecter.
          </AlertDescription>
        </Alert>
      )}
      <Button variant="outline" className="w-full" data-test="deconnexion" onClick={() => void sortir()}>
        <LogOut /> Se déconnecter
      </Button>
    </>
  );
}
