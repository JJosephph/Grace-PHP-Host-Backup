import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@renderer/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,transform,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-45 active:translate-y-px',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-[#82efd2] shadow-[0_0_0_1px_rgba(105,230,196,0.16)]',
        secondary:
          'border border-border bg-surface-strong text-foreground hover:border-border-strong hover:bg-surface-hover',
        ghost: 'text-muted-strong hover:bg-surface-hover hover:text-foreground',
        outline:
          'border border-border-strong bg-transparent text-foreground hover:bg-surface-hover',
        destructive:
          'bg-[#2a1116] text-[#ff9aa3] hover:bg-[#3a161d] border border-[#5b222b]'
      },
      size: {
        default: 'h-9 px-3.5',
        sm: 'h-8 px-3 text-xs',
        icon: 'size-9 p-0',
        'icon-sm': 'size-8 p-0'
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
