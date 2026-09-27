import { useEffect, useMemo, useState } from 'react';
import { useCreate, useList, useOne, useUpdate } from '@refinedev/core';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Champ, Ressource } from '@/description';
import { champsSaisissables } from '@/description';
import { libelleLigne, parNom } from '@/ressources';
import { messageErreur } from '@/erreurs';
import { t } from '@/i18n';
import { Button } from '@/composants/ui/button';
import { Alert, AlertDescription } from '@/composants/ui/alert';
import { Card, CardContent } from '@/composants/ui/card';
import { Checkbox } from '@/composants/ui/checkbox';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/composants/ui/field';
import { Input } from '@/composants/ui/input';
import { NativeSelect, NativeSelectOption } from '@/composants/ui/native-select';
import { Textarea } from '@/composants/ui/textarea';

/// Formulaire shadcn (react-hook-form + zod + `Field`), engendré depuis la
/// description d'une ressource. Les valeurs vivent en chaînes, comme dans les
/// champs ; `versPayload` les convertit au moment d'envoyer.
type Valeurs = Record<string, string | boolean>;

const NOMBRE = /^-?\d+(?:[.,]\d+)?$/;
const ENTIER = /^-?\d+$/;

/// Schéma de validation déduit des champs : obligatoire, nombre, entier. Les
/// règles métier (dates d'un cycle, effectifs…) restent à l'API et au paquet
/// partagé : le formulaire ne vérifie que la forme.
function schemaDe(champs: Champ[]) {
  const forme: Record<string, z.ZodType> = {};
  for (const c of champs) {
    if (c.type === 'booleen') {
      forme[c.nom] = z.boolean();
      continue;
    }
    let regle = z.string();
    if (c.requis) regle = regle.trim().min(1, t('form.obligatoire'));
    if (c.type === 'nombre' || c.type === 'monnaie') {
      forme[c.nom] = regle.refine((v) => v.trim() === '' || NOMBRE.test(v.trim()), t('form.nombre'));
    } else if (c.type === 'entier') {
      forme[c.nom] = regle.refine((v) => v.trim() === '' || ENTIER.test(v.trim()), t('form.entier'));
    } else {
      forme[c.nom] = regle;
    }
  }
  return z.object(forme);
}

function valeurInitiale(champ: Champ): string | boolean {
  if (champ.type === 'booleen') return champ.nom === 'actif';
  return '';
}

/// Ligne lue par l'API → valeurs de formulaire (tout en chaînes, sauf les cases).
function versValeurs(champs: Champ[], ligne: Record<string, unknown>): Valeurs {
  return Object.fromEntries(
    champs.map((c) => {
      const brut = ligne[c.nom];
      if (c.type === 'booleen') return [c.nom, Boolean(brut ?? valeurInitiale(c))];
      if (brut === null || brut === undefined) return [c.nom, ''];
      // Un `input[type=date]` n'accepte que « AAAA-MM-JJ » : tout le reste
      // le laisse vide, sans le dire.
      if (c.type === 'date') return [c.nom, String(brut).slice(0, 10)];
      return [c.nom, String(brut)];
    }),
  );
}

/// Les saisies arrivent en chaînes ; Prisma attend des nombres pour les
/// colonnes Decimal et Int.
///
/// Un champ vide est **omis à la création** et non envoyé à `null` : plusieurs
/// colonnes sont NOT NULL avec une valeur par défaut (`frequenceRepas`,
/// `unite`, `ordre`…), et un `null` explicite les fait rejeter par Prisma.
/// À la modification on envoie `null`, sans quoi on ne pourrait plus vider un
/// champ — or D11 demande justement de laisser un `codeFao` douteux vide.
function versPayload(champs: Champ[], valeurs: Valeurs, creation: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const champ of champs) {
    const brut = valeurs[champ.nom];
    if (champ.type === 'booleen') {
      payload[champ.nom] = Boolean(brut);
      continue;
    }
    const texte = String(brut ?? '').trim();
    if (texte === '') {
      if (!creation) payload[champ.nom] = null;
      continue;
    }
    if (champ.type === 'entier') {
      payload[champ.nom] = Number.parseInt(texte, 10);
    } else if (champ.type === 'nombre' || champ.type === 'monnaie') {
      // Virgule décimale acceptée : c'est celle que tape un francophone.
      payload[champ.nom] = Number(texte.replace(',', '.'));
    } else {
      payload[champ.nom] = texte;
    }
  }
  return payload;
}

/// Champs à vider quand `nom` change, de proche en proche : changer de région
/// vide le cercle, donc la commune.
function dependants(champs: Champ[], nom: string): string[] {
  const resultat: string[] = [];
  const aVoir = [nom];
  while (aVoir.length > 0) {
    const parent = aVoir.pop();
    for (const c of champs) {
      if (c.dependDe === parent) {
        resultat.push(c.nom);
        aVoir.push(c.nom);
      }
    }
  }
  return resultat;
}

function typeInput(champ: Champ) {
  if (champ.type === 'date') return 'date';
  if (champ.type === 'motDePasse') return 'password';
  // Les nombres restent en texte : `type=number` refuse la virgule décimale
  // et affiche des flèches inutiles ; la validation vient du schéma.
  return 'text';
}

/// Liste des options d'un champ `relation`. Un composant à part : les hooks ne
/// peuvent pas être appelés dans une boucle.
function ChampRelation({
  champ,
  control,
  valeur,
  invalide,
  libelleParent,
  onChange,
  onBlur,
}: {
  champ: Champ;
  control: Control<Valeurs>;
  valeur: string;
  invalide: boolean;
  libelleParent?: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  const liee = champ.ressourceLiee ? parNom(champ.ressourceLiee) : undefined;
  // Valeur du champ dont celui-ci dépend (`dependDe`), suivie en direct.
  const parent = useWatch({ control, name: champ.dependDe ?? '__aucun__' }) as string | undefined;
  // Sans parent choisi, rien à proposer : 792 communes en vrac ne se lisent pas.
  const enAttente = Boolean(champ.dependDe) && !parent;
  const requete = useList({
    resource: champ.ressourceLiee ?? '',
    pagination: { currentPage: 1, pageSize: 200 },
    sorters: [{ field: liee?.triDefaut ?? 'id', order: 'asc' }],
    filters: champ.dependDe && parent ? [{ field: champ.dependDe, operator: 'eq', value: parent }] : [],
    queryOptions: { enabled: Boolean(champ.ressourceLiee) && !enAttente },
  });

  const options = enAttente ? [] : ((requete.result.data ?? []) as Record<string, unknown>[]);

  // Un seul choix possible — le cercle technique du district de Bamako : on le
  // prend, plutôt que de faire choisir ce qui n'en est pas un.
  const seul = champ.dependDe && options.length === 1 ? String(options[0]!['id']) : undefined;
  useEffect(() => {
    if (seul && !valeur) onChange(seul);
  }, [seul, valeur]);

  return (
    <NativeSelect
      id={champ.nom}
      name={champ.nom}
      value={valeur}
      disabled={enAttente}
      aria-invalid={invalide}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
    >
      <NativeSelectOption value="">
        {enAttente ? t('valeur.choisirAvant', { parent: libelleParent ?? '' }) : t('valeur.vide')}
      </NativeSelectOption>
      {options.map((o) => (
        <NativeSelectOption key={String(o['id'])} value={String(o['id'])}>
          {libelleLigne(o, champ.libelleLie ?? 'nom')}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

export interface ProprietesFormulaire {
  ressource: Ressource;
  /// Identifiant de la ligne à modifier ; absent = création.
  id?: string;
  /// Valeurs imposées par le contexte — typiquement la clé du parent.
  contexte?: Record<string, string>;
  apresEnregistrement: () => void;
  onAnnuler: () => void;
}

export function FormulaireRessource({
  ressource,
  id,
  contexte = {},
  apresEnregistrement,
  onAnnuler,
}: ProprietesFormulaire) {
  const creation = !id;
  const [erreur, setErreur] = useState<string | null>(null);

  // `champs` et le schéma ne dépendent que de la ressource.
  const champs = useMemo(() => champsSaisissables(ressource), [ressource]);
  const schema = useMemo(() => schemaDe(champs), [champs]);

  const formulaire = useForm<Valeurs>({
    resolver: zodResolver(schema) as never,
    defaultValues: Object.fromEntries(champs.map((c) => [c.nom, valeurInitiale(c)])),
  });

  const existante = useOne({
    resource: ressource.nom,
    id: id ?? '',
    queryOptions: { enabled: !creation },
  });

  const { mutate: creer, mutation: creation_ } = useCreate();
  const { mutate: modifier, mutation: modification } = useUpdate();
  const enCours = creation_.isPending || modification.isPending;

  useEffect(() => {
    if (creation) {
      formulaire.reset(Object.fromEntries(champs.map((c) => [c.nom, valeurInitiale(c)])));
      return;
    }
    const ligne = existante.result as Record<string, unknown> | undefined;
    if (ligne) formulaire.reset(versValeurs(champs, ligne));
  }, [champs, creation, existante.result]);

  const enregistrer = formulaire.handleSubmit((valeurs) => {
    setErreur(null);
    const payload = { ...versPayload(champs, valeurs, creation), ...contexte };
    const options = {
      onSuccess: apresEnregistrement,
      onError: (e: unknown) => setErreur(messageErreur(e) ?? t('form.refus')),
    };
    if (creation) {
      creer({ resource: ressource.nom, values: payload }, options);
    } else {
      modifier({ resource: ressource.nom, id, values: payload }, options);
    }
  });

  /// Change un champ et vide ceux qui en dépendent.
  function changer(nom: string, valeur: string, onChange: (v: string) => void) {
    const avant = formulaire.getValues(nom);
    onChange(valeur);
    if (avant === valeur) return;
    for (const d of dependants(champs, nom)) formulaire.setValue(d, '', { shouldDirty: true });
  }

  const majuscule = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replaceAll('_', ' ');

  return (
    <form onSubmit={enregistrer} noValidate className="max-w-3xl">
      {erreur && (
        <Alert variant="destructive" className="mb-6" data-test="erreur">
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <FieldGroup className="grid gap-5 sm:grid-cols-2">
            {champs.map((champ) => (
              <Controller
                key={champ.nom}
                name={champ.nom}
                control={formulaire.control}
                render={({ field, fieldState }) => {
                  const pleineLargeur = champ.type === 'booleen' || champ.type === 'texteLong';
                  const aide = champ.aide && <FieldDescription>{champ.aide}</FieldDescription>;
                  const erreurChamp = fieldState.invalid && <FieldError errors={[fieldState.error]} />;

                  if (champ.type === 'booleen') {
                    return (
                      <Field orientation="horizontal" data-invalid={fieldState.invalid} className="sm:col-span-2">
                        <Checkbox
                          id={champ.nom}
                          name={champ.nom}
                          checked={field.value === true}
                          onCheckedChange={(coche) => field.onChange(coche === true)}
                        />
                        <FieldLabel htmlFor={champ.nom} className="font-normal">
                          {champ.libelle}
                        </FieldLabel>
                        {aide}
                      </Field>
                    );
                  }

                  const valeur = String(field.value ?? '');
                  return (
                    <Field data-invalid={fieldState.invalid} className={pleineLargeur ? 'sm:col-span-2' : undefined}>
                      <FieldLabel htmlFor={champ.nom}>
                        {champ.libelle}
                        {champ.requis && <span className="text-destructive">*</span>}
                      </FieldLabel>

                      {champ.type === 'enum' ? (
                        <NativeSelect
                          id={champ.nom}
                          name={field.name}
                          value={valeur}
                          aria-invalid={fieldState.invalid}
                          onChange={(e) => field.onChange(e.target.value)}
                          onBlur={field.onBlur}
                        >
                          <NativeSelectOption value="">{t('valeur.vide')}</NativeSelectOption>
                          {champ.options?.map((o) => (
                            <NativeSelectOption key={o} value={o}>
                              {majuscule(o)}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      ) : champ.type === 'relation' ? (
                        <ChampRelation
                          champ={champ}
                          control={formulaire.control}
                          valeur={valeur}
                          invalide={fieldState.invalid}
                          {...(champ.dependDe
                            ? { libelleParent: champs.find((c) => c.nom === champ.dependDe)?.libelle }
                            : {})}
                          onChange={(v) => changer(champ.nom, v, field.onChange)}
                          onBlur={field.onBlur}
                        />
                      ) : champ.type === 'texteLong' ? (
                        <Textarea
                          id={champ.nom}
                          name={field.name}
                          value={valeur}
                          aria-invalid={fieldState.invalid}
                          onChange={(e) => field.onChange(e.target.value)}
                          onBlur={field.onBlur}
                          ref={field.ref}
                        />
                      ) : (
                        <Input
                          id={champ.nom}
                          name={field.name}
                          type={typeInput(champ)}
                          inputMode={
                            champ.type === 'nombre' || champ.type === 'monnaie'
                              ? 'decimal'
                              : champ.type === 'entier'
                                ? 'numeric'
                                : undefined
                          }
                          autoComplete={champ.type === 'motDePasse' ? 'new-password' : undefined}
                          value={valeur}
                          aria-invalid={fieldState.invalid}
                          onChange={(e) => field.onChange(e.target.value)}
                          onBlur={field.onBlur}
                          ref={field.ref}
                        />
                      )}
                      {aide}
                      {erreurChamp}
                    </Field>
                  );
                }}
              />
            ))}
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="mt-5 flex gap-3">
        <Button data-test="enregistrer" type="submit" disabled={enCours}>
          {t('action.enregistrer')}
        </Button>
        <Button variant="outline" type="button" onClick={onAnnuler}>
          {t('action.annuler')}
        </Button>
      </div>
    </form>
  );
}
