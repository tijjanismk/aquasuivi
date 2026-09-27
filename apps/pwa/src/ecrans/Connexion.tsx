import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Fish } from 'lucide-react';
import { connecter, ErreurApi, inscrire, utilisateur } from '../session';
import { synchroniser } from '../sync';
import { Button } from '@/ui/button';
import { Alert, AlertDescription } from '@/ui/alert';
import { Input } from '@/ui/input';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/ui/field';

/// Connexion ou inscription libre d'un particulier (D19) : téléphone et mot
/// de passe suffisent. La première synchronisation charge référentiels et
/// fermes ; ensuite, plus besoin de réseau pour saisir.
export function Connexion() {
  const naviguer = useNavigate();
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion');
  const [champs, setChamps] = useState({ identifiant: '', motDePasse: '', nom: '', prenom: '' });
  const [erreur, setErreur] = useState<string | null>(null);
  const [attente, setAttente] = useState(false);

  if (utilisateur()) return <Navigate to="/" replace />;

  const maj = (cle: keyof typeof champs) => (e: { target: { value: string } }) =>
    setChamps((c) => ({ ...c, [cle]: e.target.value }));

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setAttente(true);
    try {
      if (mode === 'connexion') await connecter(champs.identifiant, champs.motDePasse);
      else
        await inscrire({
          nom: champs.nom,
          prenom: champs.prenom || undefined,
          telephone: champs.identifiant,
          motDePasse: champs.motDePasse,
        });
      await synchroniser();
      naviguer('/', { replace: true });
    } catch (x) {
      setErreur(x instanceof ErreurApi ? x.message : 'Connexion impossible.');
    } finally {
      setAttente(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-background px-5 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Fish className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Aqua-Suivi</h1>
            <p className="text-sm text-muted-foreground">Vos bassins, même sans réseau.</p>
          </div>
        </div>

        <div role="tablist" className="mb-6 grid grid-cols-2 rounded-lg bg-muted p-1 text-sm font-medium">
          {(['connexion', 'inscription'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              data-test={`onglet-${m}`}
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={mode === m ? 'rounded-md bg-card py-2 shadow-sm' : 'py-2 text-muted-foreground'}
            >
              {m === 'connexion' ? 'Se connecter' : 'Créer un compte'}
            </button>
          ))}
        </div>

        <form data-test="form-connexion" onSubmit={soumettre}>
          <FieldGroup className="gap-4">
          {mode === 'inscription' && (
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="nom">Nom</FieldLabel>
                <Input id="nom" required autoComplete="family-name" value={champs.nom} onChange={maj('nom')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="prenom">Prénom</FieldLabel>
                <Input id="prenom" autoComplete="given-name" value={champs.prenom} onChange={maj('prenom')} />
              </Field>
            </div>
          )}
          <Field>
            <FieldLabel htmlFor="identifiant">{mode === 'connexion' ? 'Téléphone ou e-mail' : 'Téléphone'}</FieldLabel>
            <Input
              id="identifiant"
              required
              inputMode={mode === 'connexion' ? 'text' : 'tel'}
              autoComplete="username"
              className="h-11 text-base"
              value={champs.identifiant}
              onChange={maj('identifiant')}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="motDePasse">Mot de passe</FieldLabel>
            <Input
              id="motDePasse"
              type="password"
              required
              minLength={mode === 'inscription' ? 8 : undefined}
              autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
              className="h-11 text-base"
              value={champs.motDePasse}
              onChange={maj('motDePasse')}
            />
            {mode === 'inscription' && <FieldDescription>Au moins 8 caractères.</FieldDescription>}
          </Field>
          {erreur && (
            <Alert variant="destructive" data-test="erreur">
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" size="lg" disabled={attente} data-test="valider">
            {attente ? 'Un instant…' : mode === 'connexion' ? 'Se connecter' : 'Créer mon compte'}
          </Button>
          </FieldGroup>
        </form>
      </div>
    </div>
  );
}
