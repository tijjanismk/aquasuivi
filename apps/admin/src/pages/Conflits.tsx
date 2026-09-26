import { useEffect, useState } from 'react';
import { appelApi } from '@/session';
import { formaterDate } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/composants/ui/button';
import { Alerte, Badge, Card } from '@/composants/ui/divers';

interface Conflit {
  id: string;
  tableCible: string;
  enregistrement: string;
  raison: string;
  resolu: boolean;
  createdAt: string;
  auteur: string | null;
  appareil: string | null;
  valeurRejetee: Record<string, unknown>;
  valeurRetenue: Record<string, unknown>;
}

const RAISONS: Record<string, string> = {
  DERNIERE_ECRITURE_CLIENT: 'Le téléphone avait la modification la plus récente : sa version a remplacé celle du serveur.',
  DERNIERE_ECRITURE_SERVEUR: 'Le serveur avait une modification plus récente : celle du téléphone a été écartée.',
  MODIFIEE_APRES_SUPPRESSION: 'Supprimée sur un téléphone, mais modifiée ailleurs après : la modification a été gardée.',
  LIGNE_SUPPRIMEE: 'Modifiée sur un téléphone alors qu’elle avait été supprimée : la suppression l’emporte.',
};

/// Champs métier seulement : identifiants et horodatages ne disent rien à l'agent.
const TECHNIQUES = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt', 'auteurId']);

function Differences({ rejetee, retenue }: { rejetee: Record<string, unknown>; retenue: Record<string, unknown> }) {
  const cles = [...new Set([...Object.keys(rejetee), ...Object.keys(retenue)])].filter((k) => !TECHNIQUES.has(k));
  const changees = cles.filter((k) => k in rejetee && JSON.stringify(rejetee[k]) !== JSON.stringify(retenue[k]));
  if (changees.length === 0) return <p className="text-sm text-muted-foreground">Aucune différence sur les champs saisis.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="py-1 pr-4 font-medium">Champ</th>
          <th className="py-1 pr-4 font-medium">Écartée</th>
          <th className="py-1 font-medium">Retenue</th>
        </tr>
      </thead>
      <tbody>
        {changees.map((k) => (
          <tr key={k} className="border-t">
            <td className="py-1 pr-4 font-medium">{k}</td>
            <td className="py-1 pr-4 text-destructive line-through">{String(rejetee[k] ?? '—')}</td>
            <td className="py-1">{String(retenue[k] ?? '—')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/// Conflits de synchronisation (D8) : rien n'est perdu, chaque valeur écartée
/// est ici. L'agent ou l'administrateur vérifie, corrige au besoin la ligne,
/// puis marque le conflit comme traité.
export function Conflits() {
  const [conflits, setConflits] = useState<Conflit[] | null>(null);
  const [tous, setTous] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = () => {
    appelApi(`/admin/conflits?_start=0&_end=100${tous ? '' : '&resolu=false'}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).message ?? String(r.status));
        return r.json();
      })
      .then(setConflits)
      .catch((e: Error) => setErreur(e.message));
  };
  useEffect(charger, [tous]);

  const marquer = async (c: Conflit) => {
    await appelApi(`/admin/conflits/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolu: !c.resolu }),
    });
    charger();
  };

  return (
    <>
      <h2 className="mb-1 text-2xl font-semibold tracking-tight">Conflits de synchronisation</h2>
      <p className="mb-6 max-w-[70ch] text-sm text-muted-foreground">
        Deux appareils ont modifié la même ligne hors ligne. La modification la plus récente a gagné ;
        l’autre est gardée ici pour qu’aucune saisie ne se perde en silence.
      </p>
      <label className="mb-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={tous} onChange={(e) => setTous(e.target.checked)} />
        Afficher aussi les conflits traités
      </label>
      {erreur && <Alerte>{erreur}</Alerte>}
      {conflits?.length === 0 && (
        <Card className="border-dashed p-6 text-center text-sm text-muted-foreground" data-test="vide">
          Aucun conflit à traiter.
        </Card>
      )}
      <div className="flex flex-col gap-3">
        {conflits?.map((c) => (
          <Card key={c.id} data-test="conflit" className={cn('p-4', c.resolu && 'opacity-60')}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{c.tableCible}</Badge>
              <span className="text-sm text-muted-foreground">
                {formaterDate(c.createdAt)} · {c.auteur ?? 'auteur inconnu'}
                {c.appareil ? ` · ${c.appareil.slice(0, 40)}` : ''}
              </span>
              {c.resolu && <Badge variant="secondary">traité</Badge>}
              <Button size="sm" variant="outline" className="ml-auto" data-test="marquer" onClick={() => void marquer(c)}>
                {c.resolu ? 'Rouvrir' : 'Marquer comme traité'}
              </Button>
            </div>
            <p className="mb-2 text-sm">{RAISONS[c.raison] ?? c.raison}</p>
            <Differences rejetee={c.valeurRejetee} retenue={c.valeurRetenue} />
          </Card>
        ))}
      </div>
    </>
  );
}
