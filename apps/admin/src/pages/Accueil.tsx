import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { API_URL } from '../config';
import { appelApi } from '../session';
import { ListeAlertes } from '@/composants/Alertes';
import type { Alerte as AlerteCycle } from '@aqua/shared';
import { REFERENTIELS } from '../referentiels';
import { formaterNombre } from '../i18n';
import { Alert, AlertDescription } from '@/composants/ui/alert';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/composants/ui/card';

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
          <Card key={c.cycleId} className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-base">
                <Link to={`/cycles/${c.cycleId}`} className="hover:text-primary">
                  {c.ferme} · {c.bassin} · cycle {c.numero}
                </Link>
              </CardTitle>
              <CardAction>
                <ChevronRight className="size-4 text-muted-foreground" />
              </CardAction>
            </CardHeader>
            <CardContent className="px-4">
              <ListeAlertes alertes={c.alertes} />
            </CardContent>
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
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>
            API injoignable sur {API_URL}. Lancez-la avec <code>pnpm dev:api</code>.
          </AlertDescription>
        </Alert>
      )}

      {sante && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries(sante.referentiels).map(([cle, valeur]) => (
            <Card key={cle} className="py-4">
              <CardHeader className="px-4">
                <CardDescription className="text-xs">{LIBELLES[cle] ?? cle}</CardDescription>
                <CardTitle className="tabulaire text-2xl">{formaterNombre(valeur)}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <AlertesEnCours />

      <div className="grid gap-3 sm:grid-cols-2">
        {REFERENTIELS.map((r) => (
          <Link key={r.chemin} to={`/referentiels/${r.chemin}`} className="group">
            <Card className="h-full py-5 transition-colors group-hover:border-primary/40 group-hover:bg-accent/40">
              <CardHeader className="px-5">
                <CardTitle className="text-base">{r.libelle}</CardTitle>
                <CardDescription className="leading-relaxed">{r.description}</CardDescription>
                <CardAction>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </CardAction>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
