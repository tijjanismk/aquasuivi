import { useState, type FormEvent } from 'react';
import { useLogin } from '@refinedev/core';
import { Fish } from 'lucide-react';
import { t } from '../i18n';
import { Button } from '@/composants/ui/button';
import { Input, Label } from '@/composants/ui/champ';
import { Alerte, Card } from '@/composants/ui/divers';

export function Connexion() {
  const { mutate: connecter, isLoading } = useLogin<{ identifiant: string; motDePasse: string }>();
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const soumettre = (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    connecter(
      { identifiant, motDePasse },
      {
        onSuccess: (r) => {
          if (!r.success) setErreur(r.error?.message ?? t('connexion.refus'));
        },
        onError: () => setErreur(t('erreur.apiInjoignable')),
      },
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Fish className="size-5" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold">{t('app.titre')}</div>
            <div className="text-xs text-muted-foreground">{t('connexion.titre')}</div>
          </div>
        </div>

        <form data-test="connexion" onSubmit={soumettre} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="identifiant">{t('connexion.identifiant')}</Label>
            <Input
              id="identifiant"
              name="identifiant"
              autoComplete="username"
              inputMode="tel"
              required
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="motDePasse">{t('connexion.motDePasse')}</Label>
            <Input
              id="motDePasse"
              name="motDePasse"
              type="password"
              autoComplete="current-password"
              required
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
          </div>
          {erreur && <Alerte data-test="erreur-connexion">{erreur}</Alerte>}
          <Button type="submit" disabled={isLoading}>
            {t('connexion.valider')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
