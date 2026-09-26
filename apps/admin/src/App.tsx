import { Fragment, lazy, Suspense } from 'react';
import { Authenticated, Refine, useGetIdentity, useLogout } from '@refinedev/core';
import routerProvider from '@refinedev/react-router';
import dataProvider from '@refinedev/simple-rest';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useParams } from 'react-router';
import {
  Fish,
  FlaskConical,
  Calculator,
  GitMerge,
  KeyRound,
  LayoutDashboard,
  Map as IconeCarte,
  MapPinned,
  UsersRound,
  LogOut,
  Scale,
  Sprout,
  Waves,
  Wheat,
  type LucideIcon,
} from 'lucide-react';
import { API_URL } from './config';
import { cn } from './lib/utils';
import { t } from './i18n';
import { REFERENTIELS } from './referentiels';
import { FERMES } from './saisie';
import { TOUTES } from './ressources';
import { Accueil } from './pages/Accueil';
import { ListeRessource } from './pages/ListeRessource';
import { PageFormulaire } from './pages/PageFormulaire';
import { FicheParent } from './pages/FicheParent';
import { FicheCycle } from './pages/FicheCycle';
import { Connexion } from './pages/Connexion';
import { Simulation } from './pages/Simulation';
import { Conflits } from './pages/Conflits';
import { Consolidation } from './pages/Consolidation';
// Leaflet pèse plus que tout le reste de l'admin : chargé à l'ouverture de la carte.
const Carte = lazy(() => import('./pages/Carte').then((m) => ({ default: m.Carte })));
import { ADMINISTRATION } from './administration';
import { authProvider, utilisateurCourant, type Utilisateur } from './session';

/// Les listes partagent une seule route. Sans cette clé, React réutilise
/// l'instance d'une ressource à l'autre : le tri de la précédente resterait
/// actif, et le tableau afficherait un instant les colonnes de la nouvelle
/// avec les lignes de l'ancienne.
function ParRessource({ enfant }: { enfant: React.ReactNode }) {
  const { ressource, id } = useParams();
  return <Fragment key={`${ressource ?? ''}/${id ?? ''}`}>{enfant}</Fragment>;
}

const lienLateral = (actif: boolean) =>
  cn(
    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    actif
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
  );

const ICONES: Record<string, LucideIcon> = {
  especes: Fish,
  'types-infrastructure': Waves,
  aliments: Wheat,
  'produits-sanitaires': FlaskConical,
  paliers: Scale,
};

function Profil() {
  const { data: moi } = useGetIdentity<Utilisateur>();
  const { mutate: deconnecter } = useLogout();
  return (
    <div className="mt-auto border-t border-sidebar-border pt-4">
      <div className="px-3 pb-2 text-xs leading-tight text-muted-foreground">
        <div data-test="profil" className="font-medium text-foreground">
          {[moi?.prenom, moi?.nom].filter(Boolean).join(' ')}
        </div>
        <div>{moi?.role}</div>
      </div>
      <button
        type="button"
        data-test="deconnexion"
        onClick={() => deconnecter()}
        className={cn(lienLateral(false), 'w-full')}
      >
        <LogOut className="size-4" />
        {t('nav.deconnexion')}
      </button>
    </div>
  );
}

function MiseEnPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Fish className="size-5" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold">{t('app.titre')}</div>
            <div className="text-xs text-muted-foreground">{t('app.sousTitre')}</div>
          </div>
        </div>

        <nav data-test="nav" className="flex flex-col gap-0.5">
          <NavLink to="/" end className={({ isActive }) => lienLateral(isActive)}>
            <LayoutDashboard className="size-4" />
            {t('nav.accueil')}
          </NavLink>

          <NavLink to="/fermes" className={({ isActive }) => lienLateral(isActive)}>
            <Sprout className="size-4" />
            {FERMES.libelle}
          </NavLink>

          <NavLink to="/carte" className={({ isActive }) => lienLateral(isActive)}>
            <MapPinned className="size-4" />
            Carte
          </NavLink>

          <NavLink to="/simulation" className={({ isActive }) => lienLateral(isActive)}>
            <Calculator className="size-4" />
            Simulation
          </NavLink>
          <NavLink to="/consolidation" className={({ isActive }) => lienLateral(isActive)}>
            <IconeCarte className="size-4" />
            Consolidation
          </NavLink>

          {utilisateurCourant()?.role === 'ADMIN' && (
            <>
              <div className="mt-4 px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Administration
              </div>
              {ADMINISTRATION.map((r) => {
                const Icone = r.chemin === 'utilisateurs' ? UsersRound : KeyRound;
                return (
                  <NavLink key={r.chemin} to={`/administration/${r.chemin}`} className={({ isActive }) => lienLateral(isActive)}>
                    <Icone className="size-4" />
                    {r.libelle}
                  </NavLink>
                );
              })}
              <NavLink to="/conflits" className={({ isActive }) => lienLateral(isActive)}>
                <GitMerge className="size-4" />
                Conflits
              </NavLink>
            </>
          )}

          <div className="mt-4 px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Référentiels
          </div>
          {REFERENTIELS.map((r) => {
            const Icone = ICONES[r.chemin] ?? Fish;
            return (
              <NavLink
                key={r.chemin}
                to={`/referentiels/${r.chemin}`}
                className={({ isActive }) => lienLateral(isActive)}
              >
                <Icone className="size-4" />
                {r.libelle}
              </NavLink>
            );
          })}
        </nav>
        <Profil />
      </aside>

      <main className="min-w-0 flex-1 px-6 py-8 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Refine
        dataProvider={dataProvider(API_URL)}
        authProvider={authProvider}
        routerProvider={routerProvider}
        resources={TOUTES.map((r) => ({ name: r.nom, meta: { label: r.libelle } }))}
        options={{ disableTelemetry: true }}
      >
        <Routes>
          <Route path="/connexion" element={<Connexion />} />
          <Route
            element={
              <Authenticated key="admin" fallback={<Navigate to="/connexion" replace />}>
                <MiseEnPage />
              </Authenticated>
            }
          >
            <Route index element={<Accueil />} />
            <Route path="/simulation" element={<Simulation />} />
            <Route path="/consolidation" element={<Consolidation />} />
            <Route
              path="/carte"
              element={
                <Suspense fallback={<p className="text-sm text-muted-foreground">Chargement de la carte…</p>}>
                  <Carte />
                </Suspense>
              }
            />
            <Route path="/conflits" element={<Conflits />} />

            {/* Administration : comptes et affectations, rôle ADMIN (étape 6). */}
            <Route
              path="/administration/:ressource"
              element={<ParRessource enfant={<ListeRessource base="administration" />} />}
            />
            <Route
              path="/administration/:ressource/nouveau"
              element={<ParRessource enfant={<PageFormulaire base="administration" />} />}
            />
            <Route
              path="/administration/:ressource/:id"
              element={<ParRessource enfant={<PageFormulaire base="administration" />} />}
            />

            {/* Référentiels : liste puis formulaire, sans fiche intermédiaire. */}
            <Route
              path="/referentiels/:ressource"
              element={<ParRessource enfant={<ListeRessource base="referentiels" />} />}
            />
            <Route
              path="/referentiels/:ressource/nouveau"
              element={<ParRessource enfant={<PageFormulaire base="referentiels" />} />}
            />
            <Route
              path="/referentiels/:ressource/:id"
              element={<ParRessource enfant={<PageFormulaire base="referentiels" />} />}
            />

            {/* Saisie : la hiérarchie ferme → infrastructure → cycle. */}
            <Route path="/fermes" element={<ListeRessource base="fermes" />} />
            <Route
              path="/fermes/nouveau"
              element={<PageFormulaire base="saisie" chemin="fermes" />}
            />
            <Route
              path="/fermes/:id"
              element={<ParRessource enfant={<FicheParent type="fermes" />} />}
            />
            <Route
              path="/infrastructures/:id"
              element={<ParRessource enfant={<FicheParent type="infrastructures" />} />}
            />
            <Route
              path="/cycles/:id"
              element={<ParRessource enfant={<FicheCycle />} />}
            />
            <Route
              path="/pesees/:id"
              element={<ParRessource enfant={<FicheParent type="pesees" />} />}
            />
            <Route
              path="/lots/:id"
              element={<ParRessource enfant={<FicheParent type="lots" />} />}
            />

            {/* Formulaires des ressources de saisie, parent en paramètre d'URL. */}
            <Route
              path="/saisie/:ressource/nouveau"
              element={<ParRessource enfant={<PageFormulaire base="saisie" />} />}
            />
            <Route
              path="/saisie/:ressource/:id"
              element={<ParRessource enfant={<PageFormulaire base="saisie" />} />}
            />
          </Route>
        </Routes>
      </Refine>
    </BrowserRouter>
  );
}
