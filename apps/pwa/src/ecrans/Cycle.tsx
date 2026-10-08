import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Banknote, Droplets, Info, TriangleAlert, Fish, FlaskConical, Pencil, Scale, Skull, Trash2, Wheat, Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { db, TABLES, type Ligne, type Segment } from '../db';
import { etatCycle, useRequete } from '../donnees';
import { date, montant, nombre } from '../format';
import { supprimer } from '../saisie';
import { Entete } from '../App';
import { Section, Vide, EnAttente } from './liste';
import { cn } from '@/lib/utils';
import { useEnAttente } from './Fermes';
import { Alert, AlertDescription } from '@/ui/alert';
import { Badge } from '@/ui/badge';
import { Card, CardContent } from '@/ui/card';

const ACTIONS: { ressource: Segment | 'pesee'; libelle: string; icone: LucideIcon }[] = [
  { ressource: 'pesee', libelle: 'Pesée', icone: Scale },
  { ressource: 'distributions', libelle: 'Aliment', icone: Wheat },
  { ressource: 'mortalites', libelle: 'Mortalité', icone: Skull },
  { ressource: 'mesures-eau', libelle: 'Eau', icone: Droplets },
  { ressource: 'recoltes', libelle: 'Récolte', icone: Warehouse },
  { ressource: 'depenses', libelle: 'Dépense', icone: Banknote },
  { ressource: 'traitements', libelle: 'Traitement', icone: FlaskConical },
  { ressource: 'lots', libelle: 'Alevins', icone: Fish },
];

/// `long` : un montant en francs CFA (« -230 000 F CFA ») ne tient pas dans
/// un tiers d'écran de téléphone à la taille des autres chiffres.
function Chiffre({ libelle, valeur, test, long }: { libelle: string; valeur: string; test?: string; long?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/60 px-3 py-2">
      <div data-test={test} className={cn('font-semibold tabular-nums break-words', long ? 'text-sm leading-7' : 'text-lg')}>{valeur}</div>
      <div className="text-xs text-muted-foreground">{libelle}</div>
    </div>
  );
}

interface Operation {
  ressource: Segment;
  ligne: Ligne;
  date: string;
  libelle: string;
  detail: string;
}

/// Toutes les opérations du cycle, de la plus récente à la plus ancienne.
async function historique(cycleId: string): Promise<Operation[]> {
  const par = (t: Segment) => TABLES[t].where('cycleId').equals(cycleId).toArray();
  const [lots, pesees, distributions, traitements, recoltes, depenses, mesures] = await Promise.all([
    par('lots'), par('pesees'), par('distributions'), par('traitements'), par('recoltes'), par('depenses'), par('mesures-eau'),
  ]);
  const morts = (await Promise.all(lots.map((l) => db.mortalites.where('lotId').equals(l.id).toArray()))).flat();
  const echantillons = (await Promise.all(pesees.map((p) => db.echantillons.where('peseeId').equals(p.id).toArray()))).flat();
  const aliments = new Map((await db.aliments.toArray()).map((a) => [a.id, a['nom'] as string]));
  const poidsMoyen = (peseeId: string) => {
    const e = echantillons.filter((x) => x['peseeId'] === peseeId);
    const n = e.reduce((s, x) => s + Number(x['nombre']), 0);
    return n > 0 ? e.reduce((s, x) => s + Number(x['poidsTotalG']), 0) / n : null;
  };
  const ops: Operation[] = [
    ...lots.map((l) => ({ ressource: 'lots' as const, ligne: l, date: l['dateMiseEnCharge'], libelle: 'Mise en charge', detail: `${nombre(l['nombre'], 0)} alevins de ${nombre(l['poidsMoyenG'])} g` })),
    ...pesees.map((p) => ({ ressource: 'pesees' as const, ligne: p, date: p['dateOperation'], libelle: `Pesée ${p['numero'] ?? ''}`, detail: poidsMoyen(p.id) ? `${nombre(poidsMoyen(p.id))} g en moyenne` : 'Échantillons à saisir' })),
    ...distributions.map((d) => ({ ressource: 'distributions' as const, ligne: d, date: d['dateDebut'], libelle: 'Aliment', detail: `${d['quantiteTotaleKg'] != null ? `${nombre(d['quantiteTotaleKg'])} kg` : `${nombre(d['rationKgJour'], 2)} kg/j`} ${aliments.get(d['alimentId']) ?? ''}` })),
    ...morts.map((m) => ({ ressource: 'mortalites' as const, ligne: m, date: m['dateConstat'], libelle: 'Mortalité', detail: `${nombre(m['nombre'], 0)} poisson(s)` })),
    ...traitements.map((t) => ({ ressource: 'traitements' as const, ligne: t, date: t['dateOperation'], libelle: 'Traitement', detail: t['finDelaiAttente'] ? `Pas de récolte avant le ${date(t['finDelaiAttente'])}` : (t['motif'] ?? '') })),
    ...recoltes.map((r) => ({ ressource: 'recoltes' as const, ligne: r, date: r['dateOperation'], libelle: 'Récolte', detail: `${nombre(r['poidsKg'])} kg · ${montant(Number(r['poidsKg']) * Number(r['prixKg'] ?? 0))}` })),
    ...depenses.map((d) => ({ ressource: 'depenses' as const, ligne: d, date: d['dateOperation'], libelle: 'Dépense', detail: montant(Number(d['montant'])) })),
    ...mesures.map((m) => ({ ressource: 'mesures-eau' as const, ligne: m, date: m['dateMesure'], libelle: 'Eau', detail: [m['temperature'] != null && `${nombre(m['temperature'])} °C`, m['oxygeneDissous'] != null && `O₂ ${nombre(m['oxygeneDissous'])}`, m['ph'] != null && `pH ${nombre(m['ph'])}`].filter(Boolean).join(' · ') })),
  ];
  return ops.sort((a, b) => (a.date === b.date ? (a.ligne.id < b.ligne.id ? 1 : -1) : a.date < b.date ? 1 : -1));
}

export function Cycle() {
  const { id = '' } = useParams();
  const naviguer = useNavigate();
  const cycle = useRequete(() => db.cycles.get(id), [id]);
  const bassin = useRequete(async () => (cycle ? db.infrastructures.get(String(cycle['infrastructureId'])) : undefined), [cycle]);
  // Recalculé à chaque écriture locale : pas besoin de réseau pour voir
  // l'effet d'une pesée sur l'indice de consommation.
  const etat = useRequete(() => etatCycle(id), [id]);
  const ops = useRequete(() => historique(id), [id]);
  const enAttente = useEnAttente();
  const [erreur, setErreur] = useState<string | null>(null);

  if (cycle === undefined) return null;
  if (!cycle) return <Vide>Cycle introuvable sur ce téléphone.</Vide>;
  const i = etat?.indicateurs;
  const clos = !!cycle['dateCloture'];

  const retirer = async (op: Operation) => {
    if (!confirm(`Supprimer « ${op.libelle} » du ${date(op.date)} ?`)) return;
    try {
      await supprimer(op.ressource, op.ligne.id);
    } catch (e) {
      setErreur((e as Error).message);
    }
  };

  return (
    <>
      <Entete
        titre={`Cycle ${cycle['numero'] ?? ''} · ${bassin?.['nom'] ?? ''}`}
        sousTitre={`Depuis le ${date(cycle['dateMiseEnCharge'])}${clos ? ` · bouclé le ${date(cycle['dateCloture'])}` : ''}`}
        retour={`/bassins/${cycle['infrastructureId']}`}
        action={
          <Link to={`/saisie/cycles/${id}`} data-test="modifier-cycle" aria-label="Modifier ou clôturer" className="rounded-md p-2 text-muted-foreground hover:bg-accent">
            <Pencil className="size-4" />
          </Link>
        }
      />

      {etat === null && (
        <Alert variant="succes" className="mb-4">
          <AlertDescription>
            <p>
              Commencez par la mise en charge : le nombre d’alevins et leur poids.
              <Link to={`/saisie/lots/nouveau?cycle=${id}`} className="ml-1 font-medium text-primary underline">Saisir les alevins</Link>
            </p>
          </AlertDescription>
        </Alert>
      )}

      {i && (
        <Card data-test="indicateurs" className="mb-4 py-4">
          <CardContent className="px-4">
          <div className="grid grid-cols-3 gap-2">
            <Chiffre test="effectif" libelle="poissons" valeur={nombre(i.zootechnie.effectifFinal, 0)} />
            <Chiffre test="poids-moyen" libelle="g en moyenne" valeur={nombre(i.zootechnie.poidsMoyenFinalG)} />
            <Chiffre test="biomasse" libelle="kg en bassin" valeur={nombre(i.production.biomasseFinaleKg)} />
            <Chiffre test="survie" libelle="% de survie" valeur={nombre(i.zootechnie.tauxSurviePct)} />
            <Chiffre test="ic" libelle="indice de conso." valeur={nombre(i.alimentation.indiceConsommation, 2)} />
            <Chiffre test="resultat" libelle="résultat" valeur={montant(i.economie.resultat)} long />
          </div>
          {/* La ration fixée à la dernière pêche fait foi jusqu'à la suivante (D29) ;
              le palier du jour n'est qu'un repère tant qu'aucune n'est fixée. */}
          {!clos && i.alimentation.rationEnCoursKgJour !== null ? (
            <p data-test="ration" className="mt-3 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
              Ration en cours : <strong>{nombre(i.alimentation.rationEnCoursKgJour, 2)} kg/j</strong>, fixée à la dernière pêche
              {etat?.ration && <span className="text-muted-foreground"> · {etat.ration.frequenceRepas} repas</span>}
            </p>
          ) : (
            etat?.ration && !clos && (
              <p data-test="ration" className="mt-3 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
                Ration conseillée : <strong>{nombre(etat.ration.rationKg, 2)} kg/j</strong> en {etat.ration.frequenceRepas} repas
                <span className="text-muted-foreground"> ({nombre(etat.ration.tauxPct)} % de la biomasse)</span>
              </p>
            )
          )}
          </CardContent>
        </Card>
      )}

      {etat && etat.alertes.length > 0 && (
        <div data-test="alertes" className="mb-4 flex flex-col gap-2">
          {etat.alertes.map((a) => (
            <div
              key={a.code}
              data-test="alerte"
              data-code={a.code}
              className={cn(
                'flex gap-2 rounded-lg border px-3 py-2 text-sm',
                a.niveau === 'critique' && 'border-destructive/40 bg-destructive/10 text-destructive',
                a.niveau === 'attention' && 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
                a.niveau === 'info' && 'border-border bg-muted/60 text-muted-foreground',
              )}
            >
              {a.niveau === 'info' ? <Info className="mt-0.5 size-4 shrink-0" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
              <span>{a.message}</span>
            </div>
          ))}
        </div>
      )}

      {!clos && (
        <div data-test="actions" className="mb-6 grid grid-cols-4 gap-2">
          {ACTIONS.map(({ ressource, libelle, icone: Icone }) => (
            <button
              key={ressource}
              type="button"
              data-test={`action-${ressource}`}
              onClick={() => naviguer(ressource === 'pesee' ? `/cycles/${id}/pesee` : `/saisie/${ressource}/nouveau?cycle=${id}`)}
              className="flex flex-col items-center gap-1 rounded-xl border bg-card px-1 py-3 text-xs font-medium shadow-xs active:bg-accent"
            >
              <Icone className="size-5 text-primary" />
              {libelle}
            </button>
          ))}
        </div>
      )}

      {erreur && <Alert variant="destructive" className="mb-4"><AlertDescription>{erreur}</AlertDescription></Alert>}

      <Section titre="Historique">
        {ops?.length === 0 && <Vide>Aucune opération pour l’instant.</Vide>}
        {ops?.map((op) => (
          <div key={op.ligne.id} data-test="operation" className="flex items-center gap-3 rounded-xl border bg-card px-4 py-2.5">
            <Link
              to={op.ressource === 'pesees' ? `/pesees/${op.ligne.id}` : `/saisie/${op.ressource}/${op.ligne.id}?cycle=${id}`}
              className="min-w-0 flex-1"
            >
              <div className="flex items-center gap-1.5 text-sm font-medium">
                {op.libelle}
                <Badge variant="muted">{date(op.date)}</Badge>
                {enAttente.has(op.ligne.id) && <EnAttente />}
              </div>
              <div className="truncate text-sm text-muted-foreground">{op.detail}</div>
            </Link>
            <button type="button" aria-label="Supprimer" onClick={() => void retirer(op)} className="rounded-md p-2 text-muted-foreground hover:bg-accent">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </Section>
    </>
  );
}
