import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { API_URL } from '../config';
import { appelApi } from '../session';
import { ListeAlertes } from '@/composants/Alertes';
import type { Alerte as AlerteCycle } from '@aqua/shared';
import { REFERENTIELS } from '../referentiels';
import { formaterNombre } from '../i18n';
import { Alerte, Card } from '@/composants/ui/divers';

interface Sante {
  base: string;
  referentiels: Record<string, number>;
}

const LIBELLES: Record<string, string> = {
  especes: 'Espèces',
  typesInfrastructure: "Types d'infrastructure",
  aliments: 'Aliments',
  produitsSanitaires: 'Produits sanitaires',
  paliers: 'Paliers',
};

interface CycleEnAlerte {
  cycleId: string;
  numero: number;
  ferme: string;
  bassin: string;
  alertes: AlerteCycle[];
}

/// Cycles en cours qui demandent un geste, sur les fermes visibles (étape 8).
function AlertesEnCours() {
  const [cycles, setCycles] = useState<CycleEnAlerte[] | null>(null);
  useEffect(() => {
    appelApi('/alertes')
      .then((r) => (r.ok ? r.json() : []))
      .then(setCycles)
      .catch(() => setCycles([]));
  }, []);
  if (!cycles || cycles.length === 0) return null;
  return (
    <section data-test="alertes-en-cours" className="mb-8">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Alertes en cours
      </h3>
      <div className="grid gap-3 lg:grid-cols-2">
        {cycles.map((c) => (
          <Card key={c.cycleId} className="p-4">
            <Link to={`/cycles/${c.cycleId}`} className="mb-2 flex items-center justify-between font-medium hover:text-primary">
              {c.ferme} · {c.bassin} · cycle {c.numero}
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
            <ListeAlertes alertes={c.alertes} />
          </Card>
        ))}
      </div>
    </section>
  );
}

export function Accueil() {
  const [sante, setSante] = useState<Sante | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/sante`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setSante)
      .catch(() => setErreur(true));
  }, []);

  return (
    <>
      <h2 className="mb-1 text-2xl font-semibold tracking-tight">
        Administration des référentiels
      </h2>
      <p className="mb-8 max-w-[70ch] text-sm text-muted-foreground">
        Les paramètres de calcul vivent en base, pas dans le code : un taux faux se corrige
        ici, sans redéploiement, et se justifie devant un bailleur.
      </p>

      {erreur && (
        <Alerte className="mb-6">
          API injoignable sur {API_URL}. Lancez-la avec <code>pnpm dev:api</code>.
        </Alerte>
      )}

      {sante && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries(sante.referentiels).map(([cle, valeur]) => (
            <Card key={cle} className="p-4">
              <div className="tabulaire text-2xl font-semibold">{formaterNombre(valeur)}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{LIBELLES[cle] ?? cle}</div>
            </Card>
          ))}
        </div>
      )}

      <AlertesEnCours />

      <div className="grid gap-3 sm:grid-cols-2">
        {REFERENTIELS.map((r) => (
          <Link key={r.chemin} to={`/referentiels/${r.chemin}`} className="group">
            <Card className="h-full p-5 transition-colors group-hover:border-primary/40 group-hover:bg-accent/40">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium">{r.libelle}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{r.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
