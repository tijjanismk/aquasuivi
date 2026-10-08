import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Plus, Trash2, X } from 'lucide-react';
import {
  calculerIndicateurs,
  cycleAuJourDeLaPesee,
  ration,
  rationDuCycle,
  type CycleComplet,
  type PalierRationnement,
  type Violation,
} from '@aqua/shared';
import { db, type Ligne } from '../db';
import { FORMULAIRES, type Option } from '../formulaires';
import { enregistrer, ErreurSaisie, supprimer } from '../saisie';
import { cycleComplet, paliersDe } from '../donnees';
import { nombre } from '../format';
import { Entete } from '../App';
import { Button } from '@/ui/button';
import { Vide } from './liste';
import { ChampSaisie } from './Saisie';
import { Alert, AlertDescription } from '@/ui/alert';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card';
import { Input } from '@/ui/input';
import { NativeSelect, NativeSelectOption } from '@/ui/native-select';

interface LigneEchantillon {
  id?: string;
  lotId: string;
  nombre: string;
  poidsTotalG: string;
}

/// Un aliment de la ration fixée à cette pêche. `auto` : la ligne suit la
/// ration calculée tant que l'opérateur ne l'a pas corrigée (une seule ligne).
interface LigneAliment {
  id?: string;
  alimentId: string;
  kgJour: string;
  prix: string;
  auto: boolean;
  /// Quantité mesurée après coup (sacs comptés) : on n'y touche pas ici.
  quantiteMesuree?: boolean;
}

const vide = (lotId = ''): LigneEchantillon => ({ lotId, nombre: '', poidsTotalG: '' });
const alimentVide = (auto = false): LigneAliment => ({ alimentId: '', kgJour: '', prix: '', auto });
const nb = (v: string) => Number(v.replace(',', '.'));
const enSaisie = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');

/// Pêche de contrôle (D27, D29) : la pesée, ses échantillons et la ration
/// qu'elle fixe, en un seul écran. La ration se calcule sur le poids moyen
/// **de cette pêche** — biomasse du jour × taux — et court jusqu'à la pêche
/// suivante : c'est elle qui donne l'aliment de la période, sans avoir à
/// peser les sacs chaque jour. Chaque échantillon est gardé tel quel (D6) :
/// c'est ce qui donne le coefficient de variation.
export function Pesee() {
  const { cycleId: cycleParam, id } = useParams();
  const naviguer = useNavigate();
  const champTaux = FORMULAIRES.pesees.champs.find((c) => c.nom === 'tauxRationPct')!;
  const champs = FORMULAIRES.pesees.champs.filter((c) => c.nom !== 'tauxRationPct');

  const [pesee, setPesee] = useState<Ligne | null>();
  const [cycleId, setCycleId] = useState<string>();
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [lots, setLots] = useState<Option[]>([]);
  const [echantillons, setEchantillons] = useState<LigneEchantillon[]>([]);
  const [retires, setRetires] = useState<string[]>([]);
  const [aliments, setAliments] = useState<Option[]>([]);
  const [lignesAliment, setLignesAliment] = useState<LigneAliment[]>([]);
  const [alimentsRetires, setAlimentsRetires] = useState<string[]>([]);
  const [complet, setComplet] = useState<CycleComplet | null>(null);
  const [paliers, setPaliers] = useState<PalierRationnement[]>([]);
  const [releves, setReleves] = useState<{ jour: string; temperature: number }[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [attente, setAttente] = useState(false);

  useEffect(() => {
    void (async () => {
      const existante = id ? ((await db.pesees.get(id)) ?? null) : undefined;
      const cid = existante?.['cycleId'] ?? cycleParam;
      const cycle = cid ? await db.cycles.get(cid) : undefined;
      const lotsDuCycle = cid ? await db.lots.where('cycleId').equals(cid).toArray() : [];
      const noms = new Map((await db.especes.toArray()).map((e) => [e.id, e['nom'] as string]));
      const options = lotsDuCycle.map((l) => ({ valeur: l.id, libelle: `${noms.get(l['especeId']) ?? 'Lot'} (${l['dateMiseEnCharge']})` }));
      const premier = options[0]?.valeur ?? '';
      const existants = id ? await db.echantillons.where('peseeId').equals(id).sortBy('numero') : [];

      const optionsAliments = (await db.aliments.toArray())
        .filter((a) => a['actif'] !== false)
        .map((a) => ({ valeur: a.id, libelle: String(a['nom']) }))
        .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));

      // En modification : les aliments déjà fixés à cette pêche. À la
      // création : ceux de la pêche précédente, reconduits avec leur prix
      // (même fournisseur la plupart du temps) — la ration, elle, se
      // recalcule toujours sur le poids du jour.
      const duCycle = cid ? await db.distributions.where('cycleId').equals(cid).toArray() : [];
      let lignes: LigneAliment[];
      if (id) {
        lignes = duCycle
          .filter((d) => d['peseeId'] === id)
          .map((d) => ({
            id: d.id,
            alimentId: String(d['alimentId'] ?? ''),
            kgJour: d['rationKgJour'] != null ? enSaisie(Number(d['rationKgJour'])) : '',
            prix: d['prixKgApplique'] != null ? String(d['prixKgApplique']) : '',
            auto: false,
            quantiteMesuree: d['quantiteTotaleKg'] != null,
          }));
      } else {
        const derniere = [...duCycle].sort((a, b) => String(b['dateDebut']).localeCompare(String(a['dateDebut'])))[0];
        const precedentes = derniere?.['peseeId'] ? duCycle.filter((d) => d['peseeId'] === derniere['peseeId']) : derniere ? [derniere] : [];
        lignes = precedentes.map((d) => ({
          alimentId: String(d['alimentId'] ?? ''),
          kgJour: '',
          prix: d['prixKgApplique'] != null ? String(d['prixKgApplique']) : '',
          auto: precedentes.length === 1,
        }));
      }

      const agregat = cid ? await cycleComplet(cid) : null;
      const mesures = cid ? await db.mesures.where('cycleId').equals(cid).toArray() : [];

      setPesee(existante);
      setCycleId(cid);
      setLots(options);
      setAliments(optionsAliments);
      setLignesAliment(lignes.length > 0 ? lignes : [alimentVide(true)]);
      setComplet(agregat);
      setPaliers(agregat ? await paliersDe([...new Set(agregat.lots.map((l) => l.especeId))]) : []);
      setReleves(
        mesures
          .filter((m) => m['temperature'] != null)
          .map((m) => ({ jour: String(m['dateMesure']), temperature: Number(m['temperature']) })),
      );
      setValeurs(Object.fromEntries(FORMULAIRES.pesees.champs.map((c) => [c.nom, String(existante?.[c.nom] ?? c.defaut?.({ cycle }) ?? '')])));
      setEchantillons(
        existants.length > 0
          ? existants.map((e) => ({ id: e.id, lotId: e['lotId'] ?? premier, nombre: String(e['nombre']), poidsTotalG: String(e['poidsTotalG']) }))
          : [vide(premier), vide(premier), vide(premier)],
      );
    })();
  }, [id, cycleParam]);

  if (pesee === null) return <Vide>Cette pesée n’existe plus sur ce téléphone.</Vide>;
  if (!cycleId) return null;

  const remplis = echantillons.filter((e) => e.nombre.trim() && e.poidsTotalG.trim() && nb(e.nombre) > 0);
  const poissons = remplis.reduce((s, e) => s + nb(e.nombre), 0);
  const moyenne = poissons > 0 ? remplis.reduce((s, e) => s + nb(e.poidsTotalG), 0) / poissons : null;

  // Le bassin tel que cette pêche le révèle : biomasse au poids du jour, et
  // le palier qui en découle. Recalculé à chaque échantillon saisi.
  const jour = valeurs['dateOperation'] ?? '';
  const etat =
    complet && jour && remplis.length > 0
      ? rationDuCycle(
          calculerIndicateurs(
            cycleAuJourDeLaPesee(
              complet,
              { id: id ?? 'saisie', numero: 0, dateOperation: jour },
              remplis.map((e, n) => ({ id: `e${n}`, lotId: e.lotId || null, numero: n + 1, nombre: nb(e.nombre), poidsTotalG: nb(e.poidsTotalG) })),
            ),
          ),
          paliers,
          releves.filter((r) => r.jour <= jour).sort((a, b) => a.jour.localeCompare(b.jour)).at(-1)?.temperature,
        )
      : null;
  const tauxSaisi = valeurs['tauxRationPct']?.trim();
  const taux = tauxSaisi ? nb(tauxSaisi) : (etat?.conseil?.tauxPct ?? null);
  const rationJour = etat && taux !== null && Number.isFinite(taux) ? ration(etat.biomasseKg, taux) : null;

  const seule = lignesAliment.length === 1;
  const kgJourDe = (l: LigneAliment) => (l.auto && seule ? (rationJour !== null ? enSaisie(rationJour) : '') : l.kgJour);
  const remplies = lignesAliment.filter((l) => l.alimentId || (!l.auto && l.kgJour.trim()));
  const reparti = remplies.reduce((s, l) => s + (nb(kgJourDe(l)) || 0), 0);

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    setViolations([]);
    if (remplis.length === 0) {
      setViolations([{ code: 'CHAMP_REQUIS', message: 'Saisissez au moins un échantillon : nombre de poissons et poids total.' }]);
      return;
    }
    if (remplies.some((l) => !l.alimentId || (!kgJourDe(l).trim() && !l.quantiteMesuree))) {
      setViolations([{ code: 'CHAMP_REQUIS', message: 'Pour chaque aliment, indiquez l’aliment et sa ration par jour.' }]);
      return;
    }
    setAttente(true);
    try {
      const saisie: Record<string, unknown> = {};
      for (const c of FORMULAIRES.pesees.champs) {
        const v = (valeurs[c.nom] ?? '').trim();
        saisie[c.nom] = v === '' ? (id ? null : undefined) : c.type === 'nombre' ? nb(v) : v;
      }
      if (!id) saisie['cycleId'] = cycleId;
      const p = await enregistrer('pesees', saisie, id);

      for (const x of retires) await supprimer('echantillons', x);
      for (const x of remplis) {
        await enregistrer(
          'echantillons',
          {
            ...(x.id ? {} : { peseeId: p.id }),
            lotId: x.lotId || null,
            nombre: Number.parseInt(x.nombre, 10),
            poidsTotalG: nb(x.poidsTotalG),
          },
          x.id,
        );
      }

      // La ration fixée court à partir du jour de la pêche ; la pêche
      // suivante la clôt d'elle-même (D29). Une ligne vidée est retirée.
      const videes = lignesAliment.filter((l) => l.id && !remplies.includes(l)).map((l) => l.id!);
      for (const x of [...alimentsRetires, ...videes]) await supprimer('distributions', x);
      for (const l of remplies) {
        const kgJour = kgJourDe(l).trim();
        await enregistrer(
          'distributions',
          {
            ...(l.id ? {} : { cycleId, peseeId: p.id }),
            alimentId: l.alimentId,
            dateDebut: p['dateOperation'],
            ...(kgJour ? { rationKgJour: nb(kgJour) } : {}),
            // Vide : prix du référentiel, figé à l'enregistrement.
            prixKgApplique: l.prix.trim() ? nb(l.prix) : l.id ? null : undefined,
          },
          l.id,
        );
      }

      naviguer(`/cycles/${cycleId}`, { replace: true });
    } catch (x) {
      setViolations(x instanceof ErreurSaisie ? x.violations : [{ code: 'ERREUR', message: (x as Error).message }]);
    } finally {
      setAttente(false);
    }
  };

  const maj = (i: number, champ: keyof LigneEchantillon, v: string) =>
    setEchantillons((liste) => liste.map((x, n) => (n === i ? { ...x, [champ]: v } : x)));
  const majAliment = (i: number, modif: Partial<LigneAliment>) =>
    setLignesAliment((liste) => liste.map((x, n) => (n === i ? { ...x, ...modif } : x)));

  return (
    <>
      <Entete titre={id ? `Pesée ${pesee?.['numero'] ?? ''}` : 'Pêche de contrôle'} retour={`/cycles/${cycleId}`} />
      <form data-test="form-pesee" onSubmit={soumettre} className="flex flex-col gap-4" noValidate>
        {champs.map((c) => (
          <ChampSaisie key={c.nom} champ={c} valeur={valeurs[c.nom] ?? ''} onChange={(v) => setValeurs((x) => ({ ...x, [c.nom]: v }))} />
        ))}

        <Card className="gap-3 py-3">
          <CardHeader className="px-3">
            <CardTitle className="text-sm">Échantillons</CardTitle>
            <CardAction data-test="moyenne" className="text-sm tabular-nums text-muted-foreground">
              {moyenne ? `${nombre(moyenne)} g en moyenne · ${poissons} poissons` : 'poids moyen —'}
            </CardAction>
          </CardHeader>
          <CardContent className="px-3">
          <div className="mb-1 grid grid-cols-[1fr_1fr_auto] gap-2 px-1 text-xs text-muted-foreground">
            <span>Poissons</span>
            <span>Poids total (g)</span>
            <span className="w-8" />
          </div>
          <div className="flex flex-col gap-2">
            {echantillons.map((x, i) => (
              <div key={x.id ?? `n${i}`} data-test="echantillon" className="flex flex-col gap-1">
                {lots.length > 1 && (
                  <NativeSelect aria-label="Lot" value={x.lotId} onChange={(e) => maj(i, 'lotId', e.target.value)}>
                    {lots.map((o) => <NativeSelectOption key={o.valeur} value={o.valeur}>{o.libelle}</NativeSelectOption>)}
                  </NativeSelect>
                )}
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input aria-label={`Poissons, échantillon ${i + 1}`} data-test="ech-nombre" inputMode="numeric" className="h-11 text-base" value={x.nombre} onChange={(e) => maj(i, 'nombre', e.target.value)} />
                  <Input aria-label={`Poids, échantillon ${i + 1}`} data-test="ech-poids" inputMode="decimal" className="h-11 text-base" value={x.poidsTotalG} onChange={(e) => maj(i, 'poidsTotalG', e.target.value)} />
                  <button
                    type="button"
                    aria-label="Retirer cet échantillon"
                    className="w-8 text-muted-foreground"
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
          </div>
          <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setEchantillons((l) => [...l, vide(lots[0]?.valeur)])}>
            <Plus /> Échantillon
          </Button>
          </CardContent>
        </Card>

        <Card className="gap-3 py-3" data-test="ration-pesee">
          <CardHeader className="px-3">
            <CardTitle className="text-sm">Ration jusqu’à la prochaine pêche</CardTitle>
            <CardDescription>
              {etat ? (
                <>
                  <span data-test="ration-biomasse">
                    Biomasse : {nombre(etat.biomasseKg)} kg ({nombre(etat.effectif, 0)} poissons × {nombre(etat.poidsMoyenG)} g)
                  </span>
                  {etat.conseil && (
                    <span className="block">
                      Palier conseillé : {nombre(etat.conseil.tauxPct, 2)} % · {nombre(etat.conseil.rationKg, 2)} kg/j en {etat.conseil.frequenceRepas} repas
                    </span>
                  )}
                </>
              ) : (
                'Saisissez les échantillons : la ration se calcule sur le poids moyen du jour.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 px-3">
            <ChampSaisie champ={champTaux} valeur={valeurs['tauxRationPct'] ?? ''} onChange={(v) => setValeurs((x) => ({ ...x, tauxRationPct: v }))} />
            <p className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
              Ration journalière : <strong data-test="ration-jour">{rationJour !== null ? `${nombre(rationJour, 2)} kg/j` : '—'}</strong>
            </p>

            <div className="grid grid-cols-[1fr_5rem_5rem_auto] gap-2 px-1 text-xs text-muted-foreground">
              <span>Aliment</span>
              <span>kg/j</span>
              <span>Prix/kg (F)</span>
              <span className="w-8" />
            </div>
            {lignesAliment.map((l, i) => (
              <div key={l.id ?? `a${i}`} data-test="ligne-aliment" className="grid grid-cols-[1fr_5rem_5rem_auto] gap-2">
                <NativeSelect aria-label={`Aliment ${i + 1}`} data-test="aliment" className="h-11 text-base" value={l.alimentId} onChange={(e) => majAliment(i, { alimentId: e.target.value })}>
                  <NativeSelectOption value="">—</NativeSelectOption>
                  {aliments.map((o) => <NativeSelectOption key={o.valeur} value={o.valeur}>{o.libelle}</NativeSelectOption>)}
                </NativeSelect>
                <Input aria-label={`Ration par jour, aliment ${i + 1}`} data-test="aliment-kg-jour" inputMode="decimal" className="h-11 text-base" value={kgJourDe(l)} onChange={(e) => majAliment(i, { kgJour: e.target.value, auto: false })} />
                <Input aria-label={`Prix du kilo, aliment ${i + 1}`} data-test="aliment-prix" inputMode="decimal" className="h-11 text-base" placeholder="réf." value={l.prix} onChange={(e) => majAliment(i, { prix: e.target.value })} />
                <button
                  type="button"
                  aria-label="Retirer cet aliment"
                  className="w-8 text-muted-foreground"
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
                Réparti : {nombre(reparti, 2)} kg/j{rationJour !== null ? ` sur ${nombre(rationJour, 2)} kg/j` : ''}
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
                // La ligne qui suivait la ration garde sa valeur : la répartition
                // se fait à la main dès qu'il y a deux aliments.
                setLignesAliment((liste) => [
                  ...liste.map((x) => (x.auto ? { ...x, kgJour: kgJourDe(x), auto: false } : x)),
                  alimentVide(),
                ])
              }
            >
              <Plus /> Aliment
            </Button>
          </CardContent>
        </Card>

        {violations.length > 0 && (
          <Alert variant="destructive" data-test="refus">
            <AlertDescription>{violations.map((v) => v.message).join(' ')}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" size="lg" disabled={attente} data-test="enregistrer">Enregistrer la pesée</Button>
        {id && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            onClick={async () => {
              if (!confirm('Supprimer cette pesée et ses échantillons ?')) return;
              await supprimer('pesees', id);
              naviguer(`/cycles/${cycleId}`, { replace: true });
            }}
          >
            <Trash2 /> Supprimer
          </Button>
        )}
      </form>
    </>
  );
}
