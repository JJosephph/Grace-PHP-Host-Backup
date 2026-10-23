import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@renderer/lib/utils'

export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>): React.JSX.Element {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border bg-[#1a202a] transition data-[state=checked]:border-primary/45 data-[state=checked]:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-3.5 translate-x-0.5 rounded-full bg-[#8d98aa] shadow transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-[#07120f]" />
    </SwitchPrimitive.Root>
  )
}
