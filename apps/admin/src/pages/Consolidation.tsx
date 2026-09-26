import { useEffect, useState } from 'react';
import { appelApi } from '@/session';
import { formaterMontant, formaterNombre } from '@/i18n';
import { cn } from '@/lib/utils';
import { Input, Label, Select } from '@/composants/ui/champ';
import { Alerte, Card } from '@/composants/ui/divers';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/composants/ui/table';

interface Ligne {
  territoireId: string | null;
  territoire: string;
  fermes: number;
  bassins: number;
  cyclesEnCours: number;
  cyclesBoucles: number;
  productionKg: number;
  produits: number;
  charges: number;
  resultat: number;
  prixRevientMoyenKg: number | null;
  tauxSurvieMoyenPct: number | null;
}

interface Reponse {
  lignes: Ligne[];
  tronque: boolean;
}

const NIVEAUX = { region: 'Région / district', cercle: 'Cercle', commune: 'Commune' } as const;

/// Consolidation territoriale (étape 6) : ce que produisent les fermes que
/// l'on peut lire, par région, cercle ou commune. Chaque cycle est chiffré
/// comme sur sa fiche, puis sommé.
export function Consolidation() {
  const annee = new Date().getFullYear();
  const [niveau, setNiveau] = useState<keyof typeof NIVEAUX>('region');
  const [depuis, setDepuis] = useState(`${annee}-01-01`);
  const [jusqua, setJusqua] = useState(`${annee}-12-31`);
  const [donnees, setDonnees] = useState<Reponse | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    setDonnees(null);
    const p = new URLSearchParams({ niveau, ...(depuis ? { depuis } : {}), ...(jusqua ? { jusqua } : {}) });
    appelApi(`/consolidation?${p}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).message ?? String(r.status));
        return r.json();
      })
      .then((d: Reponse) => {
        setErreur(null);
        setDonnees(d);
      })
      .catch((e: Error) => setErreur(e.message));
  }, [niveau, depuis, jusqua]);

  const total = donnees?.lignes.reduce(
    (t, l) => ({
      fermes: t.fermes + l.fermes,
      productionKg: t.productionKg + l.productionKg,
      produits: t.produits + l.produits,
      charges: t.charges + l.charges,
      resultat: t.resultat + l.resultat,
    }),
    { fermes: 0, productionKg: 0, produits: 0, charges: 0, resultat: 0 },
  );

  return (
    <>
      <h2 className="mb-1 text-2xl font-semibold tracking-tight">Consolidation</h2>
      <p className="mb-6 max-w-[70ch] text-sm text-muted-foreground">
        Production et résultats des cycles actifs sur la période, par territoire. Seules les fermes que
        vous pouvez consulter sont comptées.
      </p>

      <Card className="mb-6 flex flex-wrap items-end gap-4 p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="niveau">Regrouper par</Label>
          <Select id="niveau" value={niveau} onChange={(e) => setNiveau(e.target.value as keyof typeof NIVEAUX)}>
            {Object.entries(NIVEAUX).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="depuis">Du</Label>
          <Input id="depuis" type="date" value={depuis} onChange={(e) => setDepuis(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="jusqua">Au</Label>
          <Input id="jusqua" type="date" value={jusqua} onChange={(e) => setJusqua(e.target.value)} />
        </div>
      </Card>

      {erreur && <Alerte>{erreur}</Alerte>}
      {donnees?.tronque && <Alerte className="mb-4">Plus de 2 000 cycles : réduisez la période pour un total exact.</Alerte>}

      {donnees && (
        <Card className="overflow-x-auto p-0" data-test="consolidation">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{NIVEAUX[niveau]}</TableHead>
                <TableHead className="text-right">Fermes</TableHead>
                <TableHead className="text-right">Bassins</TableHead>
                <TableHead className="text-right">Cycles (en cours / bouclés)</TableHead>
                <TableHead className="text-right">Production</TableHead>
                <TableHead className="text-right">Produits</TableHead>
                <TableHead className="text-right">Charges</TableHead>
                <TableHead className="text-right">Résultat</TableHead>
                <TableHead className="text-right">Prix de revient</TableHead>
                <TableHead className="text-right">Survie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {donnees.lignes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">Aucun cycle sur la période.</TableCell>
                </TableRow>
              )}
              {donnees.lignes.map((l) => (
                <TableRow key={l.territoireId ?? 'aucun'} data-test="territoire">
                  <TableCell className={cn('font-medium', !l.territoireId && 'text-muted-foreground')}>{l.territoire}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.fermes}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.bassins}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.cyclesEnCours} / {l.cyclesBoucles}</TableCell>
                  <TableCell className="text-right tabular-nums">{formaterNombre(l.productionKg)} kg</TableCell>
                  <TableCell className="text-right tabular-nums">{formaterMontant(l.produits)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formaterMontant(l.charges)}</TableCell>
                  <TableCell className={cn('text-right tabular-nums', l.resultat < 0 && 'text-destructive')}>{formaterMontant(l.resultat)}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.prixRevientMoyenKg === null ? '—' : formaterMontant(l.prixRevientMoyenKg)}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.tauxSurvieMoyenPct === null ? '—' : `${formaterNombre(l.tauxSurvieMoyenPct)} %`}</TableCell>
                </TableRow>
              ))}
              {total && donnees.lignes.length > 1 && (
                <TableRow className="font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{total.fermes}</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right tabular-nums">{formaterNombre(total.productionKg)} kg</TableCell>
                  <TableCell className="text-right tabular-nums">{formaterMontant(total.produits)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formaterMontant(total.charges)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formaterMontant(total.resultat)}</TableCell>
                  <TableCell />
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
