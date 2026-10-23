import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>): React.JSX.Element {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded border border-border-strong bg-[#090c11] text-primary outline-none transition hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50 data-[state=checked]:border-primary/55 data-[state=checked]:bg-primary/12',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-3" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
