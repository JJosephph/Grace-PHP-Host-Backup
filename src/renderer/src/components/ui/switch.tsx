import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@renderer/lib/utils'

export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>): React.JSX.Element {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-border bg-background-deep transition data-[state=checked]:border-primary/60 data-[state=checked]:bg-primary/95 disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4.5 translate-x-0.5 rounded-full bg-[#d6dfeb] shadow transition-transform data-[state=checked]:translate-x-[22px] data-[state=checked]:bg-[#07120f]" />
    </SwitchPrimitive.Root>
  )
}
