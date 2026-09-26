import type { ComponentProps, InputHTMLAttributes, SelectHTMLAttributes } from 'react';
import { Checkbox as CheckboxRadix, Label as LabelRadix } from 'radix-ui';
import { Check } from 'lucide-react';
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

/// `select` natif, volontairement, là où shadcn prendrait le Select de Radix :
/// 800 communes se parcourent mieux au clavier et au doigt dans la liste du
/// système, et les parcours e2e pilotent un vrai `select`.
export function Select({ className, ...reste }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(base, 'cursor-pointer pr-8', className)} {...reste} />;
}

/// Case à cocher Radix (`role="checkbox"`, clavier et lecteurs d'écran).
/// `onCheckedChange` reçoit `true`, `false` ou `"indeterminate"`.
export function Checkbox({ className, ...reste }: ComponentProps<typeof CheckboxRadix.Root>) {
  return (
    <CheckboxRadix.Root
      data-slot="checkbox"
      className={cn(
        'peer size-4 shrink-0 cursor-pointer rounded-[4px] border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        className,
      )}
      {...reste}
    >
      <CheckboxRadix.Indicator className="flex items-center justify-center text-current">
        <Check className="size-3.5" />
      </CheckboxRadix.Indicator>
    </CheckboxRadix.Root>
  );
}

export function Label({ className, ...reste }: ComponentProps<typeof LabelRadix.Root>) {
  return (
    <LabelRadix.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-1 text-sm font-medium leading-none select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...reste}
    />
  );
}
