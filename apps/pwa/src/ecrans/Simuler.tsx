import { useEffect, useState, type FormEvent } from 'react';
import { aujourdhui, ErreurSimulation, simuler, type ParametresSimulation, type Simulation } from '@aqua/shared';
import { db } from '../db';
import { montant, nombre, date } from '../format';
import { appelApi, ErreurApi } from '../session';
import type { Champ, Option } from '../formulaires';
import { Entete } from '../App';
import { Button } from '@/ui/button';
import { Alerte, Card } from '@/ui/divers';
import { ChampSaisie } from './Saisie';
import { cn } from '@/lib/utils';

const CHAMPS: Champ[] = [
  { nom: 'capital', libelle: 'Capital disponible', type: 'nombre', unite: 'F', requis: true },
  { nom: 'especeId', libelle: 'Espèce', type: 'reference', requis: true },
  { nom: 'typeInfrastructureId', libelle: 'Type de bassin', type: 'reference', requis: true },
  { nom: 'taille', libelle: 'Surface ou volume', type: 'nombre', unite: 'm² ou m³', requis: true, aide: 'm² pour un étang, m³ pour un bac ou une cage.' },
  { nom: 'prixAlevin', libelle: 'Prix d’un alevin', type: 'nombre', unite: 'F', requis: true },
  { nom: 'prixAlimentKg', libelle: 'Prix du kilo d’aliment', type: 'nombre', unite: 'F', requis: true },
  { nom: 'prixVenteKg', libelle: 'Prix de vente du kilo', type: 'nombre', unite: 'F', requis: true },
  { nom: 'autresCharges', libelle: 'Autres charges du cycle', type: 'nombre', unite: 'F', aide: 'Main-d’œuvre, eau, transport…' },
  { nom: 'densite', libelle: 'Densité', type: 'nombre', unite: 'poissons/m² ou m³', aide: 'Vide : 80 % du maximum de l’espèce.' },
  { nom: 'poidsCibleG', libelle: 'Poids de vente visé', type: 'nombre', unite: 'g', aide: 'Vide : milieu de la fourchette marchande.' },
];

const NOMBRES = new Set(CHAMPS.filter((c) => c.type === 'nombre').map((c) => c.nom));

function Ligne({ libelle, valeur, fort }: { libelle: string; valeur: string; fort?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{libelle}</span>
      <span className={cn('tabular-nums', fort && 'font-semibold')}>{valeur}</span>
    </div>
  );
}

/// Simulation d'un projet (étape 9), calculée **sur le téléphone** avec les
/// repères de l'espèce : un particulier peut chiffrer son projet sans réseau,
/// avant même d'avoir un bassin. Même calcul que l'API et l'admin.
export function Simuler() {
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<Record<string, Option[]>>({});
  const [resultat, setResultat] = useState<Simulation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistree, setEnregistree] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const actifs = (l: { id: string; [k: string]: any }[]) =>
        l.filter((x) => x['actif'] !== false).map((x) => ({ valeur: x.id, libelle: x['nom'] as string }));
      const aliments = await db.aliments.toArray();
      const prixAliment = aliments.find((a) => a['prixKg'])?.['prixKg'];
      setOptions({
        especeId: actifs(await db.especes.toArray()),
        typeInfrastructureId: actifs(await db.typesInfrastructure.toArray()),
      });
      if (prixAliment) setValeurs((v) => ({ prixAlimentKg: String(prixAliment), ...v }));
    })();
  }, []);

  const calculer = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnregistree(null);
    const manquant = CHAMPS.find((c) => c.requis && !(valeurs[c.nom] ?? '').trim());
    if (manquant) {
      setErreur(`${manquant.libelle} : obligatoire.`);
      return;
    }
    const p: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valeurs)) {
      if (!v.trim()) continue;
      p[k] = NOMBRES.has(k) ? Number(v.replace(',', '.')) : v;
    }
    try {
      const [especes, types] = await Promise.all([db.especes.toArray(), db.typesInfrastructure.toArray()]);
      setResultat(simuler({ ...(p as unknown as ParametresSimulation), dateDebut: aujourdhui() }, especes as never, types as never));
    } catch (x) {
      setResultat(null);
      setErreur(x instanceof ErreurSimulation ? x.message : 'Calcul impossible.');
    }
  };

  const enregistrer = async () => {
    const nom = prompt('Nom de cette simulation ?', 'Mon projet');
    if (!nom) return;
    const parametres: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valeurs)) if (v.trim()) parametres[k] = NOMBRES.has(k) ? Number(v.replace(',', '.')) : v;
    try {
      await appelApi('/simulations', { method: 'POST', body: JSON.stringify({ nom, parametres }) });
      setEnregistree(`« ${nom} » est enregistrée dans votre compte.`);
    } catch (x) {
      setErreur(x instanceof ErreurApi ? x.message : 'Enregistrement impossible.');
    }
  };

  const r = resultat;
  return (
    <>
      <Entete titre="Simuler un projet" sousTitre="Combien produire, combien gagner ?" retour="/" />
      <form data-test="form-simulation" onSubmit={calculer} className="flex flex-col gap-4" noValidate>
        {CHAMPS.map((c) => (
          <ChampSaisie
            key={c.nom}
            champ={c}
            valeur={valeurs[c.nom] ?? ''}
            options={options[c.nom]}
            onChange={(v) => setValeurs((x) => ({ ...x, [c.nom]: v }))}
          />
        ))}
        {erreur && <Alerte data-test="erreur">{erreur}</Alerte>}
        <Button type="submit" size="lg" data-test="calculer">Calculer</Button>
      </form>

      {r && (
        <div data-test="resultat" className="mt-6 flex flex-col gap-4">
          <Card className={cn('p-4', r.rentabilite.resultat >= 0 ? 'border-primary/40' : 'border-destructive/40')}>
            <div className="text-sm text-muted-foreground">Résultat du cycle</div>
            <div data-test="sim-resultat" className={cn('text-2xl font-semibold tabular-nums', r.rentabilite.resultat < 0 && 'text-destructive')}>
              {montant(r.rentabilite.resultat)}
            </div>
            <div className="text-sm text-muted-foreground">
              {r.rentabilite.rentabilitePct !== null && `${nombre(r.rentabilite.rentabilitePct)} % de rentabilité · `}
              {montant(r.rentabilite.resultatAnnuel)} par an ({nombre(r.projection.cyclesParAn)} cycles)
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-1 text-sm font-semibold">Financement</h2>
            <Ligne libelle="À dépenser avant la vente" valeur={montant(r.financement.besoin)} fort />
            <Ligne libelle="Capital disponible" valeur={montant(r.financement.capital)} />
            <p data-test="financement" className={cn('mt-2 rounded-md px-3 py-2 text-sm', r.financement.suffisant ? 'bg-accent text-accent-foreground' : 'bg-destructive/10 text-destructive')}>
              {r.financement.suffisant
                ? `Le capital suffit, avec ${montant(r.financement.ecart)} de marge.`
                : `Il manque ${montant(-r.financement.ecart)}. Avec ce capital : ${nombre(r.financement.tailleFinancable)} m² ou m³ à cette densité.`}
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="mb-1 text-sm font-semibold">Production</h2>
            <Ligne libelle="Alevins" valeur={nombre(r.projection.effectifInitial, 0)} />
            <Ligne libelle="Poissons vendus" valeur={nombre(r.projection.effectifFinal, 0)} />
            <Ligne libelle="Durée" valeur={`${r.projection.dureeJours} jours, récolte vers le ${date(r.projection.dateRecolte)}`} />
            <Ligne libelle="Production" valeur={`${nombre(r.projection.productionKg)} kg`} fort />
            <Ligne libelle="Aliment à prévoir" valeur={`${nombre(r.projection.alimentKg)} kg`} />
          </Card>

          <Card className="p-4">
            <h2 className="mb-1 text-sm font-semibold">Seuil de rentabilité</h2>
            <Ligne libelle="Prix de revient du kilo" valeur={montant(r.rentabilite.prixRevientKg)} fort />
            <Ligne libelle="Vendre au moins" valeur={`${nombre(r.rentabilite.seuilProductionKg)} kg au prix visé`} />
          </Card>

          <Card className="p-4 text-sm text-muted-foreground">
            <h2 className="mb-1 font-semibold text-foreground">Hypothèses</h2>
            <ul className="list-disc pl-5">
              {r.hypotheses.map((h) => <li key={h}>{h}</li>)}
            </ul>
          </Card>

          {enregistree ? (
            <Alerte className="border-primary/30 bg-primary/5 text-foreground">{enregistree}</Alerte>
          ) : (
            navigator.onLine && <Button variant="outline" onClick={() => void enregistrer()}>Enregistrer dans mon compte</Button>
          )}
        </div>
      )}
    </>
  );
}
