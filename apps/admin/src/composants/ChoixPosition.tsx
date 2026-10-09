import { useEffect, useRef } from 'react';
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

/// Centre et zoom par défaut : le Mali entier (mêmes que la page Carte).
const MALI: [number, number] = [17.3, -3.5];
/// Assez près pour reconnaître un bassin sur le fond OpenStreetMap.
const ZOOM_FERME = 15;

/// Couleur lue dans le thème : Leaflet écrit `fill` en attribut SVG, où une
/// variable CSS n'est pas comprise.
function couleur(variable: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || '#15803d';
}

/// « 12,65 » ou « 12.65 » tel que le formulaire le garde ; `null` sinon.
function lire(v: string): number | null {
  const n = Number(v.trim().replace(',', '.'));
  return v.trim() !== '' && Number.isFinite(n) ? n : null;
}

/// Clic sur la carte → coordonnées. 6 décimales : une dizaine de centimètres,
/// bien en deçà de ce que l'œil distingue sur la carte.
function Clic({ onChoisir }: { onChoisir: (latitude: string, longitude: string) => void }) {
  useMapEvents({
    click: (e) => onChoisir(e.latlng.lat.toFixed(6), e.latlng.lng.toFixed(6)),
  });
  return null;
}

/// Suit le point. Le premier — celui de la fiche, ou le premier clic sur le
/// Mali entier — cadre la carte de près, pour affiner d'un second clic ; les
/// suivants ne la déplacent que s'ils sortent de la vue (coordonnées retapées
/// à la main), sans quoi chaque clic ferait sauter la carte sous le curseur.
function Suivi({ point }: { point: [number, number] | null }) {
  const carte = useMap();
  const cadre = useRef(false);
  useEffect(() => {
    if (!point) return;
    if (!cadre.current) {
      carte.setView(point, ZOOM_FERME);
      cadre.current = true;
    } else if (!carte.getBounds().contains(point)) {
      carte.panTo(point);
    }
  }, [carte, point?.[0], point?.[1]]);
  return null;
}

/// Saisie de la position d'une ferme en cliquant sur la carte (étape 11).
/// Les champs latitude et longitude restent la source : la carte les lit et
/// les écrit, on peut toujours les taper ou les corriger à la main.
export function ChoixPosition({
  latitude,
  longitude,
  onChoisir,
}: {
  latitude: string;
  longitude: string;
  onChoisir: (latitude: string, longitude: string) => void;
}) {
  const lat = lire(latitude);
  const lon = lire(longitude);
  const point: [number, number] | null = lat !== null && lon !== null ? [lat, lon] : null;

  return (
    <div data-test="choix-position" className="overflow-hidden rounded-lg border">
      {/* Pas de zoom à la molette : dans un formulaire, la molette doit faire
          défiler la page, pas dézoomer la carte jusqu'au monde entier. */}
      <MapContainer center={point ?? MALI} zoom={point ? ZOOM_FERME : 5} scrollWheelZoom={false} className="h-80 w-full cursor-crosshair">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <Clic onChoisir={onChoisir} />
        <Suivi point={point} />
        {point && (
          <CircleMarker
            center={point}
            radius={9}
            pathOptions={{ color: 'white', weight: 2, fillColor: couleur('--vert-700'), fillOpacity: 0.95 }}
          />
        )}
      </MapContainer>
    </div>
  );
}
