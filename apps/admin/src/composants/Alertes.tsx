import { Info, TriangleAlert } from 'lucide-react';
import type { Alerte } from '@aqua/shared';
import { cn } from '@/lib/utils';

/// Alertes d'un cycle (étape 8), les plus graves d'abord — l'API les trie.
export function ListeAlertes({ alertes }: { alertes: Alerte[] }) {
  return (
    <div className="flex flex-col gap-2">
      {alertes.map((a) => (
        <div
          key={a.code}
          data-test="alerte"
          data-code={a.code}
          className={cn(
            'flex gap-2 rounded-lg border px-3 py-2 text-sm',
            a.niveau === 'critique' && 'border-destructive/40 bg-destructive/8 text-destructive',
            a.niveau === 'attention' && 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
            a.niveau === 'info' && 'bg-muted/60 text-muted-foreground',
          )}
        >
          {a.niveau === 'info' ? (
            <Info className="mt-0.5 size-4 shrink-0" />
          ) : (
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          )}
          <span>{a.message}</span>
        </div>
      ))}
    </div>
  );
}
