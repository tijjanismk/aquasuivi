/// Mise en forme, français et franc CFA d'abord (D16). Même règles que
/// l'admin : pas de centimes en XOF, dates de terrain sans fuseau.

const LOCALE = 'fr-FR';

export function nombre(valeur: number | null | undefined, decimales = 1): string {
  if (valeur === null || valeur === undefined || Number.isNaN(valeur)) return '—';
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: decimales }).format(valeur);
}

export function montant(valeur: number | null | undefined): string {
  if (valeur === null || valeur === undefined) return '—';
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(valeur);
}

export function date(valeur: string | null | undefined): string {
  if (!valeur) return '—';
  const [a, m, j] = valeur.slice(0, 10).split('-');
  return a && m && j ? `${j}/${m}/${a}` : valeur;
}

/// « il y a 3 min » : l'agent veut savoir si ses données sont parties, pas l'heure exacte.
export function depuis(iso: string | null | undefined): string {
  if (!iso) return 'jamais';
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 48) return `il y a ${heures} h`;
  return `il y a ${Math.round(heures / 24)} jours`;
}
