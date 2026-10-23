import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@renderer/lib/utils'

export const TooltipProvider = TooltipPrimitive.Provider

export function Tooltip({
  content,
  children
}: {
  content: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <TooltipPrimitive.Root delayDuration={350}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={7}
          className={cn(
            'z-50 rounded-md border border-border-strong bg-surface-strong px-3 py-2 text-sm text-foreground shadow-xl',
            'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out'
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[var(--surface-strong)]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
