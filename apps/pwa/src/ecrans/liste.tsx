import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight, CloudUpload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardTitle } from '@/ui/card';

/// Éléments de liste communs aux écrans : une carte cliquable par ligne, un
/// état vide qui dit quoi faire, et un marqueur « pas encore envoyé ».

export function Carte({ vers, titre, detail, droite, test, enAttente }: {
  vers: string;
  titre: ReactNode;
  detail?: ReactNode;
  droite?: ReactNode;
  test?: string;
  enAttente?: boolean;
}) {
  return (
    <Link to={vers} data-test={test ?? 'carte'} className="block">
      <Card className="flex-row items-center gap-3 px-4 py-3 shadow-xs transition-colors active:bg-accent">
        <div className="min-w-0 flex-1">
          <CardTitle className="flex items-center gap-1.5 truncate text-base font-medium">
            {titre}
            {enAttente && <EnAttente />}
          </CardTitle>
          {detail && <CardDescription className="truncate">{detail}</CardDescription>}
        </div>
        {droite}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Card>
    </Link>
  );
}

export function EnAttente() {
  return (
    <CloudUpload
      data-test="non-envoye"
      aria-label="Pas encore envoyé"
      className="size-3.5 shrink-0 text-muted-foreground"
    />
  );
}

export function Vide({ children }: { children: ReactNode }) {
  return (
    <Card data-test="vide" className="border-dashed py-8 shadow-none">
      <CardContent className="text-center text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

export function Section({ titre, children, action }: { titre: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{titre}</h2>
        {action}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}
