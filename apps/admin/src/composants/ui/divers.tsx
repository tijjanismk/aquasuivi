import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...reste }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-xl border bg-card text-card-foreground shadow-sm', className)}
      {...reste}
    />
  );
}

const stylesBadge = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
        muted: 'border-transparent bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Badge({
  className,
  variant,
  ...reste
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof stylesBadge>) {
  return <span className={cn(stylesBadge({ variant }), className)} {...reste} />;
}

/// Utilisé pour les refus de la base : contrainte métier, doublon, champ
/// invalide. Le message vient de l'API, jamais d'une phrase inventée ici.
export function Alerte({ className, ...reste }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border border-destructive/40 bg-destructive/8 px-4 py-3 text-sm text-destructive',
        className,
      )}
      {...reste}
    />
  );
}
