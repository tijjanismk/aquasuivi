import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Plus, Trash2, X } from 'lucide-react';
import type { Violation } from '@aqua/shared';
import { db, type Ligne } from '../db';
import { FORMULAIRES, type Option } from '../formulaires';
import { enregistrer, ErreurSaisie, supprimer } from '../saisie';
import { nombre } from '../format';
import { Entete } from '../App';
import { Button } from '@/ui/button';
import { Input, Select } from '@/ui/champ';
import { Alerte, Card } from '@/ui/divers';
import { Vide } from './liste';
import { ChampSaisie } from './Saisie';

interface LigneEchantillon {
  id?: string;
  lotId: string;
  nombre: string;
  poidsTotalG: string;
}

const vide = (lotId = ''): LigneEchantillon => ({ lotId, nombre: '', poidsTotalG: '' });
const nb = (v: string) => Number(v.replace(',', '.'));

/// Pêche de contrôle : la pesée et ses échantillons en un seul écran, avec le
/// poids moyen qui se calcule à mesure. Chaque échantillon est gardé tel quel
/// (D6) : c'est ce qui donne le coefficient de variation.
export function Pesee() {
  const { cycleId: cycleParam, id } = useParams();
  const naviguer = useNavigate();
  const champs = FORMULAIRES.pesees.champs;

  const [pesee, setPesee] = useState<Ligne | null>();
  const [cycleId, setCycleId] = useState<string>();
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [lots, setLots] = useState<Option[]>([]);
  const [echantillons, setEchantillons] = useState<LigneEchantillon[]>([]);
  const [retires, setRetires] = useState<string[]>([]);
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

      setPesee(existante);
      setCycleId(cid);
      setLots(options);
      setValeurs(Object.fromEntries(champs.map((c) => [c.nom, String(existante?.[c.nom] ?? c.defaut?.({ cycle }) ?? '')])));
      setEchantillons(
        existants.length > 0
          ? existants.map((e) => ({ id: e.id, lotId: e['lotId'] ?? premier, nombre: String(e['nombre']), poidsTotalG: String(e['poidsTotalG']) }))
          : [vide(premier), vide(premier), vide(premier)],
      );
    })();
  }, [id, cycleParam, champs]);

  if (pesee === null) return <Vide>Cette pesée n’existe plus sur ce téléphone.</Vide>;
  if (!cycleId) return null;

  const remplis = echantillons.filter((e) => e.nombre.trim() && e.poidsTotalG.trim());
  const poissons = remplis.reduce((s, e) => s + nb(e.nombre), 0);
  const moyenne = poissons > 0 ? remplis.reduce((s, e) => s + nb(e.poidsTotalG), 0) / poissons : null;

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    setViolations([]);
    if (remplis.length === 0) {
      setViolations([{ code: 'CHAMP_REQUIS', message: 'Saisissez au moins un échantillon : nombre de poissons et poids total.' }]);
      return;
    }
    setAttente(true);
    try {
      const saisie: Record<string, unknown> = {};
      for (const c of champs) {
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
      naviguer(`/cycles/${cycleId}`, { replace: true });
    } catch (x) {
      setViolations(x instanceof ErreurSaisie ? x.violations : [{ code: 'ERREUR', message: (x as Error).message }]);
    } finally {
      setAttente(false);
    }
  };

  const maj = (i: number, champ: keyof LigneEchantillon, v: string) =>
    setEchantillons((liste) => liste.map((x, n) => (n === i ? { ...x, [champ]: v } : x)));

  return (
    <>
      <Entete titre={id ? `Pesée ${pesee?.['numero'] ?? ''}` : 'Pêche de contrôle'} retour={`/cycles/${cycleId}`} />
      <form data-test="form-pesee" onSubmit={soumettre} className="flex flex-col gap-4" noValidate>
        {champs.map((c) => (
          <ChampSaisie key={c.nom} champ={c} valeur={valeurs[c.nom] ?? ''} onChange={(v) => setValeurs((x) => ({ ...x, [c.nom]: v }))} />
        ))}

        <Card className="p-3">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Échantillons</h2>
            <span data-test="moyenne" className="text-sm tabular-nums text-muted-foreground">
              {moyenne ? `${nombre(moyenne)} g en moyenne · ${poissons} poissons` : 'poids moyen —'}
            </span>
          </div>
          <div className="mb-1 grid grid-cols-[1fr_1fr_auto] gap-2 px-1 text-xs text-muted-foreground">
            <span>Poissons</span>
            <span>Poids total (g)</span>
            <span className="w-8" />
          </div>
          <div className="flex flex-col gap-2">
            {echantillons.map((x, i) => (
              <div key={x.id ?? `n${i}`} data-test="echantillon" className="flex flex-col gap-1">
                {lots.length > 1 && (
                  <Select aria-label="Lot" value={x.lotId} onChange={(e) => maj(i, 'lotId', e.target.value)}>
                    {lots.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
                  </Select>
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
        </Card>

        {violations.length > 0 && <Alerte data-test="refus">{violations.map((v) => v.message).join(' ')}</Alerte>}
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
