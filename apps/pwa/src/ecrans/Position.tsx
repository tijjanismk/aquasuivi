import { useEffect, useRef, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { nombre } from '../format';
import { Button } from '@/ui/button';

/// Précision à laquelle on s'arrête : au-delà, attendre ne change plus rien
/// pour situer une ferme sur la carte.
const PRECISION_VISEE_M = 20;
/// Au-delà, le point peut tomber chez le voisin : on le dit.
const PRECISION_FAIBLE_M = 100;
/// Premier signal lent sur un téléphone d'entrée de gamme, en brousse.
const DUREE_MAX_MS = 30_000;

type Etat =
  | { phase: 'repos' }
  | { phase: 'recherche'; precision: number | null }
  | { phase: 'trouve'; precision: number }
  | { phase: 'erreur'; message: string };

function message(e: GeolocationPositionError): string {
  switch (e.code) {
    case e.PERMISSION_DENIED:
      return 'Localisation refusée : autorisez-la pour cette application dans les réglages du téléphone.';
    case e.POSITION_UNAVAILABLE:
      return 'Position introuvable : activez la localisation (GPS) du téléphone, puis réessayez à découvert.';
    default:
      return 'Pas de signal GPS à temps : réessayez à découvert, loin des bâtiments.';
  }
}

/// « Utiliser ma position » (étape 11) : relève latitude et longitude au GPS
/// du téléphone. Sans réseau aussi — seul le récepteur GPS travaille. On
/// écoute le signal quelques secondes et on garde la meilleure lecture : la
/// première est souvent grossière (plusieurs centaines de mètres).
export function BoutonPosition({ onPosition }: { onPosition: (latitude: string, longitude: string) => void }) {
  const [etat, setEtat] = useState<Etat>({ phase: 'repos' });
  /// Libère le GPS sans rien retenir (écran quitté).
  const arreter = useRef<() => void>(() => {});
  /// Termine tout de suite en gardant la meilleure lecture, s'il y en a une.
  const terminer = useRef<() => void>(() => {});

  // Écran quitté pendant la recherche : on libère le GPS.
  useEffect(() => () => arreter.current(), []);

  const relever = () => {
    if (!('geolocation' in navigator)) {
      setEtat({ phase: 'erreur', message: 'Ce téléphone ne donne pas sa position à l’application.' });
      return;
    }
    let meilleure: GeolocationPosition | null = null;
    let suivi = -1;
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    const liberer = () => {
      if (suivi >= 0) navigator.geolocation.clearWatch(suivi);
      clearTimeout(minuterie);
      arreter.current = () => {};
      terminer.current = () => {};
    };
    const retenir = (p: GeolocationPosition) => {
      liberer();
      // 6 décimales : une dizaine de centimètres, bien en deçà de la précision du GPS.
      onPosition(p.coords.latitude.toFixed(6).replace('.', ','), p.coords.longitude.toFixed(6).replace('.', ','));
      setEtat({ phase: 'trouve', precision: p.coords.accuracy });
    };
    const finir = () => {
      if (meilleure) retenir(meilleure);
      else {
        liberer();
        setEtat({ phase: 'erreur', message: 'Pas de signal GPS à temps : réessayez à découvert, loin des bâtiments.' });
      }
    };

    setEtat({ phase: 'recherche', precision: null });
    arreter.current = liberer;
    terminer.current = finir;
    suivi = navigator.geolocation.watchPosition(
      (p) => {
        if (!meilleure || p.coords.accuracy < meilleure.coords.accuracy) meilleure = p;
        if (meilleure.coords.accuracy <= PRECISION_VISEE_M) retenir(meilleure);
        else setEtat({ phase: 'recherche', precision: meilleure.coords.accuracy });
      },
      (e) => {
        if (meilleure) return retenir(meilleure);
        liberer();
        setEtat({ phase: 'erreur', message: message(e) });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: DUREE_MAX_MS },
    );
    minuterie = setTimeout(finir, DUREE_MAX_MS);
  };

  return (
    <div data-test="gps" className="flex flex-col gap-2">
      {etat.phase === 'recherche' ? (
        <Button type="button" variant="outline" size="lg" data-test="gps-arreter" onClick={() => terminer.current()}>
          Arrêter et garder la meilleure lecture
        </Button>
      ) : (
        <Button type="button" variant="outline" size="lg" data-test="gps-relever" onClick={relever}>
          <LocateFixed /> Utiliser ma position
        </Button>
      )}
      <p data-test="gps-etat" role="status" className={`text-sm ${etat.phase === 'erreur' ? 'text-destructive' : 'text-muted-foreground'}`}>
        {etat.phase === 'repos' && 'Debout sur la ferme, à découvert. Fonctionne sans réseau.'}
        {etat.phase === 'recherche' &&
          (etat.precision === null ? 'Recherche du signal GPS…' : `Recherche du signal GPS… précision actuelle ± ${nombre(etat.precision, 0)} m`)}
        {etat.phase === 'trouve' &&
          (etat.precision > PRECISION_FAIBLE_M
            ? `Position relevée à ± ${nombre(etat.precision, 0)} m seulement : à découvert, loin des bâtiments, réessayez.`
            : `Position relevée à ± ${nombre(etat.precision, 0)} m près.`)}
        {etat.phase === 'erreur' && etat.message}
      </p>
    </div>
  );
}
