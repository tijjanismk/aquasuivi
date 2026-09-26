import type { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Table({ className, ...reste }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table
        className={cn('tabulaire w-full caption-bottom border-collapse text-sm', className)}
        {...reste}
      />
    </div>
  );
}

export function TableHeader({ className, ...reste }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('[&_tr]:border-b', className)} {...reste} />;
}

export function TableBody({ className, ...reste }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...reste} />;
}

export function TableRow({ className, ...reste }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('border-b transition-colors hover:bg-muted/50', className)}
      {...reste}
    />
  );
}

/// Pas de majuscules ni de `nowrap` : les libellés français sont longs
/// (« Gain journalier de référence (g/j) ») et forçaient le tableau à déborder
/// horizontalement, coupant la colonne d'actions.
export function TableHead({ className, ...reste }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'h-10 px-3 py-2 text-left align-bottom text-xs font-semibold leading-tight text-muted-foreground',
        className,
      )}
      {...reste}
    />
  );
}

export function TableCell({ className, ...reste }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('whitespace-nowrap px-3 py-2.5 align-middle', className)} {...reste} />
  );
}
