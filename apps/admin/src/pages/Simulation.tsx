import { useEffect, useState, type FormEvent } from 'react';
import { useList } from '@refinedev/core';
import type { Simulation as ResultatSimulation } from '@aqua/shared';
import { appelApi } from '@/session';
import { formaterDate, formaterMontant, formaterNombre } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/composants/ui/button';
import { Input, Label, Select } from '@/composants/ui/champ';
import { Alerte, Card } from '@/composants/ui/divers';

interface ChampSim {
  nom: string;
  libelle: string;
  aide?: string;
  requis?: boolean;
  choix?: 'especes' | 'types';
}

const CHAMPS: ChampSim[] = [
  { nom: 'capital', libelle: 'Capital disponible (F)', requis: true },
  { nom: 'especeId', libelle: 'Espèce', requis: true, choix: 'especes' },
  { nom: 'typeInfrastructureId', libelle: 'Type de bassin', requis: true, choix: 'types' },
  { nom: 'taille', libelle: 'Surface (m²) ou volume (m³)', requis: true },
  { nom: 'prixAlevin', libelle: 'Prix d’un alevin (F)', requis: true },
  { nom: 'prixAlimentKg', libelle: 'Prix du kilo d’aliment (F)', requis: true },
  { nom: 'prixVenteKg', libelle: 'Prix de vente du kilo (F)', requis: true },
  { nom: 'autresCharges', libelle: 'Autres charges du cycle (F)', aide: 'Main-d’œuvre, eau, transport…' },
  { nom: 'densite', libelle: 'Densité (/m² ou /m³)', aide: 'Vide : 80 % du maximum de l’espèce.' },
  { nom: 'poidsCibleG', libelle: 'Poids de vente visé (g)', aide: 'Vide : milieu de la fourchette marchande.' },
];

interface Enregistree {
  id: string;
  nom: string;
  createdAt: string;
  parametres: Record<string, unknown>;
  resultats: { rentabilite?: { resultat: number } } | null;
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{libelle}</span>
      <span className="tabular-nums">{valeur}</span>
    </div>
  );
}

/// Étape 9 : projeter un projet avant de l'engager. Le calcul est celui de
/// `@aqua/shared`, exécuté par l'API — le même que sur le téléphone.
export function Simulation() {
  const especes = useList({ resource: 'referentiels/especes', pagination: { pageSize: 200 } });
  const types = useList({ resource: 'referentiels/types-infrastructure', pagination: { pageSize: 200 } });
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [resultat, setResultat] = useState<ResultatSimulation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistrees, setEnregistrees] = useState<Enregistree[]>([]);

  const recharger = () =>
    appelApi('/simulations')
      .then((r) => (r.ok ? r.json() : []))
      .then(setEnregistrees)
      .catch(() => setEnregistrees([]));
  useEffect(() => void recharger(), []);

  const parametres = () =>
    Object.fromEntries(Object.entries(valeurs).filter(([, v]) => v.trim() !== ''));

  const envoyer = async (chemin: string, corps: unknown) => {
    const r = await appelApi(chemin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const donnees = await r.json();
    if (!r.ok) throw new Error(donnees.message ?? 'Calcul impossible.');
    return donnees;
  };

  const calculer = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    try {
      setResultat(await envoyer('/simulations/calculer', parametres()));
    } catch (x) {
      setResultat(null);
      setErreur((x as Error).message);
    }
  };

  const enregistrer = async () => {
    const nom = prompt('Nom de la simulation ?');
    if (!nom) return;
    try {
      await envoyer('/simulations', { nom, parametres: parametres() });
      await recharger();
    } catch (x) {
      setErreur((x as Error).message);
    }
  };

  const options = (choix: ChampSim['choix']) =>
    ((choix === 'especes' ? especes : types).data?.data ?? []).map((l) => ({ id: String(l['id']), nom: String(l['nom']) }));

  const r = resultat;
  return (
    <>
      <h2 className="mb-1 text-2xl font-semibold tracking-tight">Simulation</h2>
      <p className="mb-6 max-w-[70ch] text-sm text-muted-foreground">
        Un capital, une espèce, un bassin : production, charges, prix de revient et seuil de
        rentabilité, projetés avec les repères de l’espèce et chiffrés par le même calcul que les cycles réels.
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <form data-test="form-simulation" onSubmit={calculer} className="grid gap-4 sm:grid-cols-2">
            {CHAMPS.map((c) => (
              <div key={c.nom} className="flex flex-col gap-1.5">
                <Label htmlFor={`sim-${c.nom}`}>
                  {c.libelle}
                  {c.requis && <span className="text-destructive"> *</span>}
                </Label>
                {c.choix ? (
                  <Select id={`sim-${c.nom}`} value={valeurs[c.nom] ?? ''} onChange={(e) => setValeurs((v) => ({ ...v, [c.nom]: e.target.value }))}>
                    <option value="">Choisir…</option>
                    {options(c.choix).map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
                  </Select>
                ) : (
                  <Input id={`sim-${c.nom}`} inputMode="decimal" value={valeurs[c.nom] ?? ''} onChange={(e) => setValeurs((v) => ({ ...v, [c.nom]: e.target.value }))} />
                )}
                {c.aide && <p className="text-xs text-muted-foreground">{c.aide}</p>}
              </div>
            ))}
            {erreur && <Alerte className="sm:col-span-2">{erreur}</Alerte>}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" data-test="calculer">Calculer</Button>
              {r && <Button type="button" variant="outline" onClick={() => void enregistrer()}>Enregistrer</Button>}
            </div>
          </form>
        </Card>

        {r && (
          <Card data-test="resultat" className="p-5">
            <div className="mb-4">
              <div className="text-sm text-muted-foreground">Résultat du cycle</div>
              <div data-test="sim-resultat" className={cn('text-3xl font-semibold tabular-nums', r.rentabilite.resultat < 0 && 'text-destructive')}>
                {formaterMontant(r.rentabilite.resultat)}
              </div>
              <div className="text-sm text-muted-foreground">
                {r.rentabilite.rentabilitePct !== null && `${formaterNombre(r.rentabilite.rentabilitePct)} % · `}
                {formaterMontant(r.rentabilite.resultatAnnuel)} par an
              </div>
            </div>
            <Alerte className={cn('mb-4', r.financement.suffisant && 'border-primary/30 bg-primary/5 text-foreground')}>
              {r.financement.suffisant
                ? `Capital suffisant : ${formaterMontant(r.financement.besoin)} à engager, ${formaterMontant(r.financement.ecart)} de marge.`
                : `Il manque ${formaterMontant(-r.financement.ecart)} sur ${formaterMontant(r.financement.besoin)}. Taille finançable : ${formaterNombre(r.financement.tailleFinancable)}.`}
            </Alerte>
            <Ligne libelle="Alevins → poissons vendus" valeur={`${formaterNombre(r.projection.effectifInitial)} → ${formaterNombre(r.projection.effectifFinal)}`} />
            <Ligne libelle="Durée" valeur={`${r.projection.dureeJours} jours (${formaterNombre(r.projection.cyclesParAn)} cycles/an)`} />
            <Ligne libelle="Production" valeur={`${formaterNombre(r.projection.productionKg)} kg`} />
            <Ligne libelle="Aliment" valeur={`${formaterNombre(r.projection.alimentKg)} kg`} />
            <Ligne libelle="Charges totales" valeur={formaterMontant(r.indicateurs.economie.charges.total)} />
            <Ligne libelle="Prix de revient / seuil de prix" valeur={formaterMontant(r.rentabilite.prixRevientKg ?? 0)} />
            <Ligne libelle="Production minimale à vendre" valeur={`${formaterNombre(r.rentabilite.seuilProductionKg ?? 0)} kg`} />
            <ul className="mt-4 list-disc pl-5 text-xs text-muted-foreground">
              {r.hypotheses.map((h) => <li key={h}>{h}</li>)}
            </ul>
          </Card>
        )}
      </div>

      {enregistrees.length > 0 && (
        <section className="mt-8">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Simulations enregistrées</h3>
          <div className="grid gap-2">
            {enregistrees.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setValeurs(Object.fromEntries(Object.entries(s.parametres).map(([k, v]) => [k, String(v)])))}
                className="flex items-center justify-between rounded-lg border bg-card px-4 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="font-medium">{s.nom}</span>
                <span className="text-muted-foreground">
                  {s.resultats?.rentabilite ? formaterMontant(s.resultats.rentabilite.resultat) : ''} · {formaterDate(s.createdAt)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
