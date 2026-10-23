import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '@renderer/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold',
  {
    variants: {
      variant: {
        default: 'border-primary/20 bg-primary/10 text-primary',
        neutral: 'border-border bg-surface-strong text-muted-strong',
        danger: 'border-[#5b222b] bg-[#2a1116] text-[#ff9aa3]',
        warning: 'border-[#5a4820] bg-[#2a2415] text-warning'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>): React.JSX.Element {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
