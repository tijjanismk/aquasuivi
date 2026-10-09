import { useEffect, useMemo, useState } from 'react';
import { useCreate, useDelete, useList, useOne, useUpdate } from '@refinedev/core';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { aujourdhui, ration, type RationDuCycle } from '@aqua/shared';
import { appelApi } from '@/session';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { t } from '@/i18n';
import { messageErreur } from '@/erreurs';
import { Button } from '@/composants/ui/button';
import { Alert, AlertDescription } from '@/composants/ui/alert';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/composants/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/composants/ui/field';
import { Input } from '@/composants/ui/input';
import { NativeSelect, NativeSelectOption } from '@/composants/ui/native-select';

/// Pêche de contrôle : la pesée, ses échantillons et la ration qu'elle fixe
/// dans un seul écran, comme sur le téléphone (D27, D29 — `apps/pwa/.../Pesee.tsx`).
/// Un formulaire dédié plutôt que le `FormulaireRessource` générique : les
/// échantillons ne sont pas un champ, ce sont des lignes qu'on ajoute et
/// qu'on pèse une à une. La ration se calcule sur le poids de **cette**
/// pêche (biomasse du jour × taux) et court jusqu'à la pêche suivante.
interface LigneEchantillon {
  id?: string;
  lotId: string;
  nombre: string;
  poidsTotalG: string;
}

/// Un aliment de la ration. `auto` : suit la ration calculée tant que
/// l'opérateur ne l'a pas corrigée (une seule ligne).
interface LigneAliment {
  id?: string;
  alimentId: string;
  kgJour: string;
  prix: string;
  auto: boolean;
  quantiteMesuree?: boolean;
}

const vide = (lotId = ''): LigneEchantillon => ({ lotId, nombre: '', poidsTotalG: '' });
const alimentVide = (auto = false): LigneAliment => ({ alimentId: '', kgJour: '', prix: '', auto });
const nb = (v: string) => Number(v.replace(',', '.'));
const enSaisie = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
const libelleLot = (l: Record<string, unknown>, especes: Map<string, string>) =>
  `${especes.get(String(l['especeId'])) ?? 'Lot'} (${String(l['dateMiseEnCharge'] ?? '').slice(0, 10)})`;

export function FormulairePesee() {
  const { id } = useParams();
  const [parametres] = useSearchParams();
  const naviguer = useNavigate();
  const creation = !id;
  const retour = parametres.get('retour') ?? '/fermes';

  const [dateOperation, setDateOperation] = useState(() => (creation ? aujourdhui() : ''));
  const [tauxRationPct, setTauxRationPct] = useState('');
  const [observation, setObservation] = useState('');
  const [echantillons, setEchantillons] = useState<LigneEchantillon[]>([vide(), vide(), vide()]);
  const [retires, setRetires] = useState<string[]>([]);
  const [lignesAliment, setLignesAliment] = useState<LigneAliment[]>([alimentVide(true)]);
  const [alimentsRetires, setAlimentsRetires] = useState<string[]>([]);
  const [etat, setEtat] = useState<RationDuCycle | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const existante = useOne({ resource: 'saisie/pesees', id: id ?? '', queryOptions: { enabled: !creation } });
  const pesee = existante.result as Record<string, unknown> | undefined;
  const cycleId = creation ? (parametres.get('cycleId') ?? '') : String(pesee?.['cycleId'] ?? '');

  const echantillonsExistants = useList({
    resource: 'saisie/echantillons',
    filters: [{ field: 'peseeId', operator: 'eq', value: id }],
    sorters: [{ field: 'numero', order: 'asc' }],
    pagination: { pageSize: 200 },
    queryOptions: { enabled: !creation },
  });
  const lots = useList({
    resource: 'saisie/lots',
    filters: [{ field: 'cycleId', operator: 'eq', value: cycleId }],
    pagination: { pageSize: 200 },
    queryOptions: { enabled: !!cycleId },
  });
  const especes = useList({ resource: 'referentiels/especes', pagination: { pageSize: 200 } });
  const aliments = useList({
    resource: 'referentiels/aliments',
    filters: [{ field: 'actif', operator: 'eq', value: true }],
    sorters: [{ field: 'nom', order: 'asc' }],
    pagination: { pageSize: 200 },
  });
  const distributionsDuCycle = useList({
    resource: 'saisie/distributions',
    filters: [{ field: 'cycleId', operator: 'eq', value: cycleId }],
    sorters: [{ field: 'dateDebut', order: 'desc' }],
    pagination: { pageSize: 200 },
    queryOptions: { enabled: !!cycleId },
  });

  const especesParId = useMemo(
    () => new Map((especes.result.data ?? []).map((e) => [String(e['id']), String(e['nom'])])),
    [especes.result],
  );
  const optionsLots = (lots.result.data ?? []) as Record<string, unknown>[];
  const optionsAliments = (aliments.result.data ?? []) as Record<string, unknown>[];

  // Champs de la pesée : chargés une fois la ligne existante arrivée. En
  // création, `dateOperation` part déjà sur aujourd'hui (état initial paresseux
  // ci-dessus) — un effet ici la réécrirait à chaque rendu où `pesee` change de
  // référence, effaçant une date que l'opérateur vient de corriger.
  useEffect(() => {
    if (creation || !pesee) return;
    setDateOperation(String(pesee['dateOperation'] ?? '').slice(0, 10));
    setTauxRationPct(pesee['tauxRationPct'] != null ? String(pesee['tauxRationPct']) : '');
    setObservation(String(pesee['observation'] ?? ''));
  }, [creation, pesee]);

  // Échantillons déjà saisis, si on modifie une pesée existante.
  useEffect(() => {
    if (creation) return;
    const lignes = echantillonsExistants.result.data ?? [];
    if (lignes.length === 0) return;
    setEchantillons(
      lignes.map((e) => ({
        id: String(e['id']),
        lotId: String(e['lotId'] ?? ''),
        nombre: String(e['nombre']),
        poidsTotalG: String(e['poidsTotalG']),
      })),
    );
    // `echantillonsExistants.result` n'est stable qu'une fois chargé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creation, echantillonsExistants.result.data?.length]);

  // Aliments de la ration : ceux déjà fixés à cette pêche en modification ;
  // à la création, ceux de la pêche précédente avec leur prix (même
  // fournisseur la plupart du temps) — la ration, elle, se recalcule.
  useEffect(() => {
    const liste = (distributionsDuCycle.result.data ?? []) as Record<string, unknown>[];
    if (liste.length === 0) return;
    let lignes: LigneAliment[];
    if (!creation) {
      lignes = liste
        .filter((d) => d['peseeId'] === id)
        .map((d) => ({
          id: String(d['id']),
          alimentId: String(d['alimentId'] ?? ''),
          kgJour: d['rationKgJour'] != null ? enSaisie(Number(d['rationKgJour'])) : '',
          prix: d['prixKgApplique'] != null ? String(d['prixKgApplique']) : '',
          auto: false,
          quantiteMesuree: d['quantiteTotaleKg'] != null,
        }));
    } else {
      const derniere = liste[0]!;
      const precedentes = derniere['peseeId'] ? liste.filter((d) => d['peseeId'] === derniere['peseeId']) : [derniere];
      lignes = precedentes.map((d) => ({
        alimentId: String(d['alimentId'] ?? ''),
        kgJour: '',
        prix: d['prixKgApplique'] != null ? String(d['prixKgApplique']) : '',
        auto: precedentes.length === 1,
      }));
    }
    if (lignes.length > 0) setLignesAliment(lignes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creation, id, distributionsDuCycle.result.data?.length]);

  const { mutate: creerLigne } = useCreate();
  const { mutate: modifierLigne } = useUpdate();
  const { mutate: supprimerLigne } = useDelete();

  const creer = (resource: string, values: Record<string, unknown>) =>
    new Promise<Record<string, unknown>>((resolve, reject) =>
      creerLigne({ resource, values }, { onSuccess: (r) => resolve(r.data as Record<string, unknown>), onError: reject }),
    );
  const modifier = (resource: string, id: string, values: Record<string, unknown>) =>
    new Promise<Record<string, unknown>>((resolve, reject) =>
      modifierLigne({ resource, id, values }, { onSuccess: (r) => resolve(r.data as Record<string, unknown>), onError: reject }),
    );
  const supprimer = (resource: string, id: string) =>
    new Promise<void>((resolve, reject) => supprimerLigne({ resource, id }, { onSuccess: () => resolve(), onError: reject }));

  const remplis = echantillons.filter((e) => e.nombre.trim() && e.poidsTotalG.trim() && nb(e.nombre) > 0);

  // Biomasse au poids de cette pêche et palier conseillé : calculés par l'API
  // (`POST /cycles/:id/ration`, même fonction que le téléphone), après une
  // courte pause de saisie plutôt qu'à chaque touche.
  const cleRation = JSON.stringify([cycleId, dateOperation, remplis.map((e) => [e.lotId, e.nombre, e.poidsTotalG])]);
  useEffect(() => {
    if (!cycleId || !dateOperation || remplis.length === 0) {
      setEtat(null);
      return;
    }
    let annule = false;
    const minuterie = setTimeout(() => {
      appelApi(`/cycles/${cycleId}/ration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          peseeId: id,
          dateOperation,
          echantillons: remplis.map((e) => ({ lotId: e.lotId || null, nombre: nb(e.nombre), poidsTotalG: nb(e.poidsTotalG) })),
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((r: RationDuCycle | null) => {
          if (!annule) setEtat(r);
        })
        .catch(() => {
          if (!annule) setEtat(null);
        });
    }, 300);
    return () => {
      annule = true;
      clearTimeout(minuterie);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleRation]);

  const taux = tauxRationPct.trim() ? nb(tauxRationPct) : (etat?.conseil?.tauxPct ?? null);
  const rationJour = etat && taux !== null && Number.isFinite(taux) ? ration(etat.biomasseKg, taux) : null;
  const seule = lignesAliment.length === 1;
  const kgJourDe = (l: LigneAliment) => (l.auto && seule ? (rationJour !== null ? enSaisie(rationJour) : '') : l.kgJour);
  const remplies = lignesAliment.filter((l) => l.alimentId || (!l.auto && l.kgJour.trim()));
  const reparti = remplies.reduce((s, l) => s + (nb(kgJourDe(l)) || 0), 0);
  const majAliment = (i: number, modif: Partial<LigneAliment>) =>
    setLignesAliment((liste) => liste.map((x, n) => (n === i ? { ...x, ...modif } : x)));

  const enregistrer = async () => {
    setErreur(null);
    if (remplis.length === 0) {
      setErreur('Saisissez au moins un échantillon : nombre de poissons et poids total.');
      return;
    }
    if (remplies.some((l) => !l.alimentId || (!kgJourDe(l).trim() && !l.quantiteMesuree))) {
      setErreur('Pour chaque aliment, indiquez l’aliment et sa ration par jour.');
      return;
    }
    setEnCours(true);
    try {
      const valeurs: Record<string, unknown> = {
        dateOperation,
        tauxRationPct: tauxRationPct.trim() ? nb(tauxRationPct) : null,
        observation: observation.trim() || null,
        ...(creation ? { cycleId } : {}),
      };
      const p = creation ? await creer('saisie/pesees', valeurs) : await modifier('saisie/pesees', id, valeurs);

      for (const x of retires) await supprimer('saisie/echantillons', x);
      for (const x of remplis) {
        const valeursEch = {
          lotId: x.lotId || null,
          nombre: Number.parseInt(x.nombre, 10),
          poidsTotalG: nb(x.poidsTotalG),
        };
        if (x.id) await modifier('saisie/echantillons', x.id, valeursEch);
        else await creer('saisie/echantillons', { ...valeursEch, peseeId: p['id'] });
      }

      // La ration court à partir du jour de la pêche ; la pêche suivante la
      // clôt d'elle-même (D29). Une ligne vidée est retirée.
      const videes = lignesAliment.filter((l) => l.id && !remplies.includes(l)).map((l) => l.id!);
      for (const x of [...alimentsRetires, ...videes]) await supprimer('saisie/distributions', x);
      for (const l of remplies) {
        const kgJour = kgJourDe(l).trim();
        const valeursDist = {
          alimentId: l.alimentId,
          dateDebut: String(p['dateOperation']).slice(0, 10),
          ...(kgJour ? { rationKgJour: nb(kgJour) } : {}),
          // Vide : prix du référentiel, figé par l'API à l'enregistrement.
          prixKgApplique: l.prix.trim() ? nb(l.prix) : l.id ? null : undefined,
        };
        if (l.id) await modifier('saisie/distributions', l.id, valeursDist);
        else await creer('saisie/distributions', { ...valeursDist, cycleId, peseeId: p['id'] });
      }

      naviguer(retour);
    } catch (e) {
      setErreur(messageErreur(e) ?? t('form.refus'));
    } finally {
      setEnCours(false);
    }
  };

  const majEchantillon = (i: number, champ: keyof LigneEchantillon, v: string) =>
    setEchantillons((liste) => liste.map((x, n) => (n === i ? { ...x, [champ]: v } : x)));

  return (
    <>
      <button
        type="button"
        onClick={() => naviguer(retour)}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('action.retour')}
      </button>

      <h2 className="mb-6 text-2xl font-semibold tracking-tight">
        {creation ? 'Nouvelle entrée — pêche de contrôle' : `Modifier — pêche de contrôle`}
      </h2>

      {erreur && (
        <Alert variant="destructive" className="mb-6" data-test="erreur">
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}

      <div className="flex max-w-3xl flex-col gap-6">
        <Card>
          <CardContent>
            <FieldGroup className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="dateOperation">Date{<span className="text-destructive">*</span>}</FieldLabel>
                <Input id="dateOperation" type="date" value={dateOperation} onChange={(e) => setDateOperation(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="observation">Observation</FieldLabel>
                <Input id="observation" value={observation} onChange={(e) => setObservation(e.target.value)} />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card className="gap-3 py-3">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Échantillons</CardTitle>
            <CardAction data-test="moyenne" className="text-sm tabular-nums text-muted-foreground">
              {(() => {
                const poissons = remplis.reduce((s, e) => s + nb(e.nombre), 0);
                const moyenne = poissons > 0 ? remplis.reduce((s, e) => s + nb(e.poidsTotalG), 0) / poissons : null;
                return moyenne ? `${moyenne.toFixed(1)} g en moyenne · ${poissons} poissons` : 'poids moyen —';
              })()}
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 px-4">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-1 text-xs text-muted-foreground">
              <span>{optionsLots.length > 1 ? 'Lot' : ''}</span>
              <span />
              <span className="w-8" />
            </div>
            {echantillons.map((x, i) => (
              <div key={x.id ?? `n${i}`} data-test="echantillon" className="flex flex-col gap-1.5 border-b pb-3 last:border-0 last:pb-0">
                {optionsLots.length > 1 && (
                  <NativeSelect aria-label="Lot" value={x.lotId} onChange={(e) => majEchantillon(i, 'lotId', e.target.value)}>
                    <NativeSelectOption value="">{t('valeur.vide')}</NativeSelectOption>
                    {optionsLots.map((l) => (
                      <NativeSelectOption key={String(l['id'])} value={String(l['id'])}>
                        {libelleLot(l, especesParId)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input
                    aria-label={`Poissons, échantillon ${i + 1}`}
                    data-test="ech-nombre"
                    inputMode="numeric"
                    placeholder="Poissons"
                    value={x.nombre}
                    onChange={(e) => majEchantillon(i, 'nombre', e.target.value)}
                  />
                  <Input
                    aria-label={`Poids total, échantillon ${i + 1}`}
                    data-test="ech-poids"
                    inputMode="decimal"
                    placeholder="Poids total (g)"
                    value={x.poidsTotalG}
                    onChange={(e) => majEchantillon(i, 'poidsTotalG', e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label="Retirer cet échantillon"
                    className="w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (x.id) setRetires((r) => [...r, x.id!]);
                      setEchantillons((liste) => liste.filter((_, n) => n !== i));
                    }}
                  >
                    <X className="mx-auto size-4" />
                  </button>
                </div>
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setEchantillons((l) => [...l, vide(optionsLots[0]?.['id'] as string)])}>
              <Plus /> Échantillon
            </Button>
          </CardContent>
        </Card>

        <Card data-test="ration-pesee">
          <CardHeader>
            <CardTitle className="text-sm">Ration jusqu’à la prochaine pêche</CardTitle>
            <CardDescription>
              {etat ? (
                <>
                  <span data-test="ration-biomasse">
                    Biomasse : {etat.biomasseKg.toLocaleString('fr-FR')} kg ({etat.effectif.toLocaleString('fr-FR')} poissons ×{' '}
                    {etat.poidsMoyenG.toLocaleString('fr-FR')} g)
                  </span>
                  {etat.conseil && (
                    <span className="block">
                      Palier conseillé : {etat.conseil.tauxPct.toLocaleString('fr-FR')} % ·{' '}
                      {etat.conseil.rationKg.toLocaleString('fr-FR')} kg/j en {etat.conseil.frequenceRepas} repas
                    </span>
                  )}
                </>
              ) : (
                'Saisissez les échantillons : la ration se calcule sur le poids moyen du jour.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="tauxRationPct">Taux de ration retenu (%)</FieldLabel>
                <Input id="tauxRationPct" inputMode="decimal" value={tauxRationPct} onChange={(e) => setTauxRationPct(e.target.value)} />
                <FieldDescription>Laissez vide pour suivre le palier conseillé.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Ration journalière</FieldLabel>
                <p className="flex h-9 items-center text-sm">
                  <strong data-test="ration-jour">
                    {rationJour !== null ? `${rationJour.toLocaleString('fr-FR')} kg/j` : '—'}
                  </strong>
                </p>
              </Field>
            </FieldGroup>

            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-[1fr_7rem_7rem_auto] gap-2 px-1 text-xs text-muted-foreground">
                <span>Aliment</span>
                <span>Ration (kg/j)</span>
                <span>Prix du kilo (F)</span>
                <span className="w-8" />
              </div>
              {lignesAliment.map((l, i) => (
                <div key={l.id ?? `a${i}`} data-test="ligne-aliment" className="grid grid-cols-[1fr_7rem_7rem_auto] gap-2">
                  <NativeSelect aria-label={`Aliment ${i + 1}`} data-test="aliment" value={l.alimentId} onChange={(e) => majAliment(i, { alimentId: e.target.value })}>
                    <NativeSelectOption value="">{t('valeur.vide')}</NativeSelectOption>
                    {optionsAliments.map((a) => (
                      <NativeSelectOption key={String(a['id'])} value={String(a['id'])}>
                        {String(a['nom'])}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <Input
                    aria-label={`Ration par jour, aliment ${i + 1}`}
                    data-test="aliment-kg-jour"
                    inputMode="decimal"
                    value={kgJourDe(l)}
                    onChange={(e) => majAliment(i, { kgJour: e.target.value, auto: false })}
                  />
                  <Input
                    aria-label={`Prix du kilo, aliment ${i + 1}`}
                    data-test="aliment-prix"
                    inputMode="decimal"
                    placeholder="référentiel"
                    value={l.prix}
                    onChange={(e) => majAliment(i, { prix: e.target.value })}
                  />
                  <button
                    type="button"
                    aria-label="Retirer cet aliment"
                    className="w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (l.id) setAlimentsRetires((r) => [...r, l.id!]);
                      setLignesAliment((liste) => liste.filter((_, n) => n !== i));
                    }}
                  >
                    <X className="mx-auto size-4" />
                  </button>
                </div>
              ))}
              {lignesAliment.length > 1 && (
                <p data-test="repartition" className="text-sm tabular-nums text-muted-foreground">
                  Réparti : {reparti.toLocaleString('fr-FR')} kg/j
                  {rationJour !== null ? ` sur ${rationJour.toLocaleString('fr-FR')} kg/j` : ''}
                </p>
              )}
              {remplies.length === 0 && (
                <p className="text-sm text-muted-foreground">Sans aliment ici, aucun aliment n’est compté après cette pêche.</p>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit"
                onClick={() =>
                  // La ligne qui suivait la ration garde sa valeur : à deux
                  // aliments, la répartition se fait à la main.
                  setLignesAliment((liste) => [
                    ...liste.map((x) => (x.auto ? { ...x, kgJour: kgJourDe(x), auto: false } : x)),
                    alimentVide(),
                  ])
                }
              >
                <Plus /> Aliment
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button data-test="enregistrer" disabled={enCours} onClick={() => void enregistrer()}>
            {t('action.enregistrer')}
          </Button>
          <Button variant="outline" onClick={() => naviguer(retour)}>
            {t('action.annuler')}
          </Button>
        </div>
      </div>
    </>
  );
}
