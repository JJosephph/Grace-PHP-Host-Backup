import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@renderer/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-[color,background-color,border-color,transform,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-60 active:translate-y-px',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-[#8af0d5] shadow-[0_0_0_1px_rgba(111,231,198,0.2)]',
        secondary:
          'border border-border bg-surface-strong text-foreground hover:border-border-strong hover:bg-surface-hover',
        ghost: 'text-muted-strong hover:bg-surface-hover hover:text-foreground',
        outline:
          'border border-border-strong bg-transparent text-foreground hover:bg-surface-hover',
        destructive:
          'bg-[#2a1116] text-[#ff9aa3] hover:bg-[#3a161d] border border-[#5b222b]'
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-9 px-3.5 text-xs',
        icon: 'size-10 p-0',
        'icon-sm': 'size-9 p-0'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps): React.JSX.Element {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
