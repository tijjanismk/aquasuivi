import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import { latLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { appelApi } from '@/session';
import { Alerte, Badge, Card } from '@/composants/ui/divers';

/// Carte des fermes (D25). Fond OpenStreetMap : gratuit, sans clé ni compte,
/// mais servi par Internet — hors ligne, les points restent, le fond disparaît.

interface Ferme {
  id: string;
  nom: string;
  promoteur: string | null;
  village: string | null;
  latitude: number | null;
  longitude: number | null;
  region?: { nom: string } | null;
  cercle?: { nom: string } | null;
  commune?: { nom: string } | null;
}

interface AlerteCycle {
  fermeId: string;
  bassin: string;
  alertes: { niveau: 'critique' | 'attention' | string; message: string }[];
}

type Etat = 'critique' | 'attention' | 'ok';

/// Centre et zoom par défaut : le Mali entier.
const MALI: [number, number] = [17.3, -3.5];

/// Couleurs lues dans le thème, pour que la carte suive le vert de l'interface.
function couleur(variable: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || '#15803d';
}

const LIBELLES: Record<Etat, string> = { critique: 'Alerte critique', attention: 'À surveiller', ok: 'Rien à signaler' };

/// Cadre la carte sur les fermes affichées, une fois qu'elles sont chargées.
function Cadrage({ points }: { points: [number, number][] }) {
  const carte = useMap();
  useEffect(() => {
    if (points.length === 1) carte.setView(points[0]!, 11);
    else if (points.length > 1) carte.fitBounds(latLngBounds(points), { padding: [40, 40], maxZoom: 11 });
  }, [carte, points]);
  return null;
}

async function lire<T>(chemin: string): Promise<T> {
  const r = await appelApi(chemin);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? String(r.status));
  return r.json() as Promise<T>;
}

export function Carte() {
  const [fermes, setFermes] = useState<Ferme[] | null>(null);
  const [alertes, setAlertes] = useState<AlerteCycle[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    lire<Ferme[]>('/saisie/fermes?_start=0&_end=2000')
      .then(setFermes)
      .catch((e: Error) => setErreur(e.message));
    // Les alertes colorent les points ; sans elles, la carte reste utile.
    lire<AlerteCycle[]>('/alertes').then(setAlertes).catch(() => setAlertes([]));
  }, []);

  const etats = useMemo(() => {
    const m = new Map<string, Etat>();
    for (const c of alertes) {
      const pire = c.alertes.some((a) => a.niveau === 'critique') ? 'critique' : 'attention';
      if (m.get(c.fermeId) !== 'critique') m.set(c.fermeId, pire);
    }
    return m;
  }, [alertes]);

  const placees = (fermes ?? []).filter((f) => f.latitude !== null && f.longitude !== null);
  const sansPosition = (fermes ?? []).filter((f) => f.latitude === null || f.longitude === null);
  const points = useMemo(() => placees.map((f) => [Number(f.latitude), Number(f.longitude)] as [number, number]), [fermes]);

  const teintes: Record<Etat, string> = useMemo(
    () => ({ critique: couleur('--destructive'), attention: 'oklch(0.769 0.188 70.08)', ok: couleur('--vert-700') }),
    [],
  );

  return (
    <>
      <h2 className="mb-1 text-2xl font-semibold tracking-tight">Carte des fermes</h2>
      <p className="mb-6 max-w-[70ch] text-sm text-muted-foreground">
        Chaque ferme renseignée avec sa latitude et sa longitude, colorée selon les alertes de ses cycles en
        cours. Fond de carte OpenStreetMap : il faut une connexion pour l’afficher.
      </p>

      {erreur && <Alerte className="mb-4">{erreur}</Alerte>}

      <div className="mb-3 flex flex-wrap gap-4 text-sm">
        {(Object.keys(LIBELLES) as Etat[]).map((e) => (
          <span key={e} className="flex items-center gap-2">
            <span className="size-3 rounded-full" style={{ background: teintes[e] }} />
            {LIBELLES[e]}
          </span>
        ))}
        <span className="ml-auto text-muted-foreground">
          {fermes ? `${placees.length} ferme(s) placée(s) sur ${fermes.length}` : 'Chargement…'}
        </span>
      </div>

      <Card className="overflow-hidden p-0">
        <MapContainer center={MALI} zoom={5} scrollWheelZoom className="h-[560px] w-full" data-test="carte">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <Cadrage points={points} />
          {placees.map((f) => {
            const etat = etats.get(f.id) ?? 'ok';
            return (
              <CircleMarker
                key={f.id}
                center={[Number(f.latitude), Number(f.longitude)]}
                radius={etat === 'ok' ? 8 : 10}
                pathOptions={{ color: 'white', weight: 2, fillColor: teintes[etat], fillOpacity: 0.95 }}
              >
                <Popup>
                  <div className="min-w-44 space-y-1">
                    <div className="font-semibold">{f.nom}</div>
                    {f.promoteur && <div>{f.promoteur}</div>}
                    <div className="text-xs opacity-75">
                      {[f.village, f.commune?.nom, f.cercle?.nom, f.region?.nom].filter(Boolean).join(' · ')}
                    </div>
                    {etat !== 'ok' && (
                      <ul className="list-disc pl-4 text-xs">
                        {alertes.filter((a) => a.fermeId === f.id).flatMap((a) =>
                          a.alertes.map((x, i) => <li key={`${a.bassin}-${i}`}>{a.bassin} : {x.message}</li>),
                        )}
                      </ul>
                    )}
                    <Link to={`/fermes/${f.id}`} className="inline-block pt-1 font-medium">
                      Ouvrir la fiche →
                    </Link>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </Card>

      {sansPosition.length > 0 && (
        <Card className="mt-6 p-5">
          <h3 className="mb-1 font-semibold">Fermes sans coordonnées</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            À compléter depuis leur fiche (latitude et longitude) pour qu’elles apparaissent sur la carte.
          </p>
          <div className="flex flex-wrap gap-2">
            {sansPosition.map((f) => (
              <Link key={f.id} to={`/fermes/${f.id}`}>
                <Badge variant="outline">{f.nom}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
