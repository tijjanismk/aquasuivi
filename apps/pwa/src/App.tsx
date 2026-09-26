import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate } from 'react-router';
import { ArrowLeft, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { db, lireMeta } from './db';
import { useRequete } from './donnees';
import { depuis } from './format';
import { utilisateur } from './session';
import { synchroniser } from './sync';
import { cn } from '@/lib/utils';
import { Connexion } from './ecrans/Connexion';
import { Fermes } from './ecrans/Fermes';
import { Ferme } from './ecrans/Ferme';
import { Bassin } from './ecrans/Bassin';
import { Cycle } from './ecrans/Cycle';
import { Saisie } from './ecrans/Saisie';
import { Pesee } from './ecrans/Pesee';
import { Corrections } from './ecrans/Corrections';
import { Compte } from './ecrans/Compte';

function useEnLigne() {
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  useEffect(() => {
    const oui = () => setEnLigne(true);
    const non = () => setEnLigne(false);
    window.addEventListener('online', oui);
    window.addEventListener('offline', non);
    return () => {
      window.removeEventListener('online', oui);
      window.removeEventListener('offline', non);
    };
  }, []);
  return enLigne;
}

/// État de la synchronisation, toujours visible : l'agent doit savoir sans
/// chercher si ses saisies sont parties.
function BarreSync() {
  const enLigne = useEnLigne();
  const etat = useRequete(async () => ({
    attente: await db.journal.where('etat').anyOf('attente', 'envoi').count(),
    rejets: await db.journal.where('etat').equals('rejete').count(),
    derniere: await lireMeta<string>('derniereSync'),
    enCours: await lireMeta<boolean>('syncEnCours'),
    erreur: await lireMeta<string | null>('derniereErreur'),
    reseauIndisponible: await lireMeta<boolean>('reseauIndisponible'),
  }));
  // Rafraîchit « il y a n min » sans attendre une écriture.
  const [, battre] = useState(0);
  useEffect(() => {
    const t = setInterval(() => battre((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div data-test="barre-sync" className="border-b bg-card/80 px-4 py-2 text-xs backdrop-blur">
      <div className="mx-auto flex max-w-xl items-center gap-2">
        {enLigne && !etat?.reseauIndisponible ? (
          <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
        ) : (
          <CloudOff className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span data-test="etat-sync" className="min-w-0 flex-1 truncate text-muted-foreground">
          {!enLigne
            ? 'Hors ligne — vos saisies sont gardées sur le téléphone'
            : etat?.enCours
              ? 'Synchronisation…'
              : etat?.erreur
                ? etat.erreur
                : `Synchronisé ${depuis(etat?.derniere)}`}
          {etat && etat.attente > 0 && (
            <span data-test="en-attente" className="ml-1 font-medium text-foreground">
              · {etat.attente} en attente
            </span>
          )}
        </span>
        {etat && etat.rejets > 0 && (
          <Link
            to="/corrections"
            data-test="lien-corrections"
            className="flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 font-medium text-destructive"
          >
            <TriangleAlert className="size-3.5" /> {etat.rejets} à corriger
          </Link>
        )}
        <button
          type="button"
          data-test="synchroniser"
          aria-label="Synchroniser maintenant"
          disabled={!enLigne || !!etat?.enCours}
          onClick={() => void synchroniser()}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-40"
        >
          <RefreshCw className={cn('size-4', etat?.enCours && 'animate-spin')} />
        </button>
      </div>
    </div>
  );
}

/// En-tête d'écran : retour, titre, action éventuelle à droite.
export function Entete({ titre, retour, action, sousTitre }: { titre: string; retour?: string; action?: ReactNode; sousTitre?: string }) {
  const naviguer = useNavigate();
  return (
    <header className="mb-4 flex items-center gap-2">
      {retour !== undefined && (
        <button
          type="button"
          aria-label="Retour"
          data-test="retour"
          onClick={() => naviguer(retour)}
          className="-ml-2 rounded-md p-2 text-muted-foreground hover:bg-accent"
        >
          <ArrowLeft className="size-5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 data-test="titre" className="truncate text-xl font-semibold tracking-tight">{titre}</h1>
        {sousTitre && <p className="truncate text-sm text-muted-foreground">{sousTitre}</p>}
      </div>
      {action}
    </header>
  );
}

function Protege({ enfant }: { enfant: ReactNode }) {
  return utilisateur() ? (
    <div className="min-h-dvh bg-background">
      <BarreSync />
      <main className="mx-auto max-w-xl px-4 pt-4 pb-24">{enfant}</main>
    </div>
  ) : (
    <Navigate to="/connexion" replace />
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/connexion" element={<Connexion />} />
        <Route path="/" element={<Protege enfant={<Fermes />} />} />
        <Route path="/compte" element={<Protege enfant={<Compte />} />} />
        <Route path="/fermes/:id" element={<Protege enfant={<Ferme />} />} />
        <Route path="/bassins/:id" element={<Protege enfant={<Bassin />} />} />
        <Route path="/cycles/:id" element={<Protege enfant={<Cycle />} />} />
        <Route path="/cycles/:cycleId/pesee" element={<Protege enfant={<Pesee />} />} />
        <Route path="/pesees/:id" element={<Protege enfant={<Pesee />} />} />
        <Route path="/saisie/:ressource/nouveau" element={<Protege enfant={<Saisie />} />} />
        <Route path="/saisie/:ressource/:id" element={<Protege enfant={<Saisie />} />} />
        <Route path="/corrections" element={<Protege enfant={<Corrections />} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
