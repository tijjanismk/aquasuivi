import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  SelectHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

const base =
  'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20';

export function Input({ className, ...reste }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        base,
        'file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground',
        className,
      )}
      {...reste}
    />
  );
}

/// `select` natif, volontairement : un composant sur mesure serait plus joli
/// mais moins utilisable au clavier, et les référentiels ont beaucoup d'options.
export function Select({ className, ...reste }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(base, 'cursor-pointer pr-8', className)} {...reste} />;
}

export function Checkbox({ className, ...reste }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        'size-4 shrink-0 cursor-pointer rounded-[4px] border border-input accent-primary shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
      {...reste}
    />
  );
}

export function Label({ className, ...reste }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        'flex items-center gap-1 text-sm font-medium leading-none select-none',
        className,
      )}
      {...reste}
    />
  );
}
