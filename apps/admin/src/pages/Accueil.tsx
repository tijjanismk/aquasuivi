import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { API_URL } from '../config';
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
