import { useState } from 'react';
import { useLogin } from '@refinedev/core';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Fish } from 'lucide-react';
import { t } from '../i18n';
import { Button } from '@/composants/ui/button';
import { Alert, AlertDescription } from '@/composants/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/composants/ui/card';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/composants/ui/field';
import { Input } from '@/composants/ui/input';

const schema = z.object({
  identifiant: z.string().trim().min(1, t('form.obligatoire')),
  motDePasse: z.string().min(1, t('form.obligatoire')),
});
type Identifiants = z.infer<typeof schema>;

export function Connexion() {
  const { mutate: connecter, isPending } = useLogin<Identifiants>();
  const [erreur, setErreur] = useState<string | null>(null);
  const formulaire = useForm<Identifiants>({
    resolver: zodResolver(schema),
    defaultValues: { identifiant: '', motDePasse: '' },
  });

  const soumettre = formulaire.handleSubmit((valeurs) => {
    setErreur(null);
    connecter(valeurs, {
      onSuccess: (r) => {
        if (!r.success) setErreur(r.error?.message ?? t('connexion.refus'));
      },
      onError: () => setErreur(t('erreur.apiInjoignable')),
    });
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Fish className="size-5" />
          </span>
          <div className="leading-tight">
            <CardTitle className="text-sm">{t('app.titre')}</CardTitle>
            <CardDescription className="text-xs">{t('connexion.titre')}</CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form data-test="connexion" onSubmit={soumettre} noValidate>
            <FieldGroup>
              <Controller
                name="identifiant"
                control={formulaire.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="identifiant">{t('connexion.identifiant')}</FieldLabel>
                    <Input
                      {...field}
                      id="identifiant"
                      autoComplete="username"
                      inputMode="tel"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="motDePasse"
                control={formulaire.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="motDePasse">{t('connexion.motDePasse')}</FieldLabel>
                    <Input
                      {...field}
                      id="motDePasse"
                      type="password"
                      autoComplete="current-password"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              {erreur && (
                <Alert variant="destructive" data-test="erreur-connexion">
                  <AlertDescription>{erreur}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" disabled={isPending}>
                {t('connexion.valider')}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
