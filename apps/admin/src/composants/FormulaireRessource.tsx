import { useEffect, useState } from 'react';
import { useCreate, useList, useOne, useUpdate } from '@refinedev/core';
import type { Champ, Ressource } from '@/description';
import { champsSaisissables } from '@/description';
import { libelleLigne, parNom } from '@/ressources';
import { messageErreur } from '@/erreurs';
import { t } from '@/i18n';
import { Button } from '@/composants/ui/button';
import { Checkbox, Input, Label, Select } from '@/composants/ui/champ';
import { Alerte, Card } from '@/composants/ui/divers';

type Valeurs = Record<string, unknown>;

function valeurInitiale(champ: Champ): unknown {
  if (champ.type === 'booleen') return champ.nom === 'actif';
  return '';
}

/// Les saisies arrivent en chaînes ; Prisma attend des nombres pour les
/// colonnes Decimal et Int.
///
/// Un champ vide est **omis à la création** et non envoyé à `null` : plusieurs
/// colonnes sont NOT NULL avec une valeur par défaut (`frequenceRepas`,
/// `unite`, `ordre`…), et un `null` explicite les fait rejeter par Prisma.
/// À la modification on envoie `null`, sans quoi on ne pourrait plus vider un
/// champ — or D11 demande justement de laisser un `codeFao` douteux vide.
function versPayload(champs: Champ[], valeurs: Valeurs, creation: boolean): Valeurs {
  const payload: Valeurs = {};
  for (const champ of champs) {
    const brut = valeurs[champ.nom];
    if (champ.type === 'booleen') {
      payload[champ.nom] = Boolean(brut);
      continue;
    }
    if (brut === '' || brut === undefined || brut === null) {
      if (!creation) payload[champ.nom] = null;
      continue;
    }
    if (champ.type === 'entier') {
      payload[champ.nom] = Number.parseInt(String(brut), 10);
    } else if (champ.type === 'nombre' || champ.type === 'monnaie') {
      payload[champ.nom] = Number(brut);
    } else {
      payload[champ.nom] = brut;
    }
  }
  return payload;
}

function typeInput(champ: Champ) {
  if (champ.type === 'date') return 'date';
  if (champ.type === 'texte' || champ.type === 'texteLong') return 'text';
  return 'number';
}

/// Liste des options d'un champ `relation`. Un composant à part : les hooks ne
/// peuvent pas être appelés dans une boucle.
function ChampRelation({
  champ,
  valeur,
  onChange,
}: {
  champ: Champ;
  valeur: string;
  onChange: (v: string) => void;
}) {
  const liee = champ.ressourceLiee ? parNom(champ.ressourceLiee) : undefined;
  const requete = useList({
    resource: champ.ressourceLiee ?? '',
    pagination: { current: 1, pageSize: 200 },
    sorters: [{ field: liee?.triDefaut ?? 'id', order: 'asc' }],
    queryOptions: { enabled: Boolean(champ.ressourceLiee) },
  });

  const options = (requete.data?.data ?? []) as Record<string, unknown>[];

  return (
    <Select
      id={champ.nom}
      value={valeur}
      required={champ.requis}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{t('valeur.vide')}</option>
      {options.map((o) => (
        <option key={String(o['id'])} value={String(o['id'])}>
          {libelleLigne(o, champ.libelleLie ?? 'nom')}
        </option>
      ))}
    </Select>
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
  const [valeurs, setValeurs] = useState<Valeurs>({});
  const [erreur, setErreur] = useState<string | null>(null);

  const champs = champsSaisissables(ressource);

  const existante = useOne({
    resource: ressource.nom,
    id: id ?? '',
    queryOptions: { enabled: !creation },
  });

  const { mutate: creer, isLoading: enCreation } = useCreate();
  const { mutate: modifier, isLoading: enModification } = useUpdate();

  useEffect(() => {
    if (creation) {
      setValeurs(Object.fromEntries(champs.map((c) => [c.nom, valeurInitiale(c)])));
      return;
    }
    const ligne = existante.data?.data as Valeurs | undefined;
    if (!ligne) return;
    setValeurs(
      Object.fromEntries(
        champs.map((c) => {
          const brut = ligne[c.nom];
          // Un `input[type=date]` n'accepte que « AAAA-MM-JJ » : tout le reste
          // le laisse vide, sans le dire.
          if (c.type === 'date' && typeof brut === 'string') return [c.nom, brut.slice(0, 10)];
          return [c.nom, brut ?? valeurInitiale(c)];
        }),
      ),
    );
    // `champs` est dérivé de `ressource` : inutile de le suivre séparément.
  }, [ressource, creation, existante.data]);

  function enregistrer(evenement: React.FormEvent) {
    evenement.preventDefault();
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
  }

  const majuscule = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replaceAll('_', ' ');

  return (
    <form onSubmit={enregistrer} className="max-w-3xl">
      {erreur && (
        <Alerte className="mb-6" data-test="erreur">
          {erreur}
        </Alerte>
      )}

      <Card className="p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          {champs.map((champ) => (
            <div
              key={champ.nom}
              className={
                champ.type === 'booleen' || champ.type === 'texteLong'
                  ? 'sm:col-span-2'
                  : undefined
              }
            >
              {champ.type === 'booleen' ? (
                <Label htmlFor={champ.nom} className="cursor-pointer gap-2">
                  <Checkbox
                    id={champ.nom}
                    checked={Boolean(valeurs[champ.nom])}
                    onChange={(e) =>
                      setValeurs((v) => ({ ...v, [champ.nom]: e.target.checked }))
                    }
                  />
                  {champ.libelle}
                </Label>
              ) : (
                <>
                  <Label htmlFor={champ.nom} className="mb-1.5">
                    {champ.libelle}
                    {champ.requis && <span className="text-destructive">*</span>}
                  </Label>

                  {champ.type === 'enum' ? (
                    <Select
                      id={champ.nom}
                      value={String(valeurs[champ.nom] ?? '')}
                      required={champ.requis}
                      onChange={(e) =>
                        setValeurs((v) => ({ ...v, [champ.nom]: e.target.value }))
                      }
                    >
                      <option value="">{t('valeur.vide')}</option>
                      {champ.options?.map((o) => (
                        <option key={o} value={o}>
                          {majuscule(o)}
                        </option>
                      ))}
                    </Select>
                  ) : champ.type === 'relation' ? (
                    <ChampRelation
                      champ={champ}
                      valeur={String(valeurs[champ.nom] ?? '')}
                      onChange={(v) => setValeurs((x) => ({ ...x, [champ.nom]: v }))}
                    />
                  ) : (
                    <Input
                      id={champ.nom}
                      type={typeInput(champ)}
                      {...(champ.type === 'nombre' || champ.type === 'monnaie'
                        ? { step: 'any' }
                        : {})}
                      required={champ.requis}
                      value={String(valeurs[champ.nom] ?? '')}
                      onChange={(e) =>
                        setValeurs((v) => ({ ...v, [champ.nom]: e.target.value }))
                      }
                    />
                  )}
                </>
              )}

              {champ.aide && (
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {champ.aide}
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-5 flex gap-3">
        <Button data-test="enregistrer" type="submit" disabled={enCreation || enModification}>
          {t('action.enregistrer')}
        </Button>
        <Button variant="outline" type="button" onClick={onAnnuler}>
          {t('action.annuler')}
        </Button>
      </div>
    </form>
  );
}
