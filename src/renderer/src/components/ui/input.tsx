import type { InputHTMLAttributes } from 'react'
import { cn } from '@renderer/lib/utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return (
    <input
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background-deep px-3.5 py-1 text-sm text-foreground shadow-inner shadow-black/10 outline-none transition placeholder:text-muted focus:border-primary/75 focus:ring-2 focus:ring-primary/20 disabled:opacity-60',
        className
      )}
      {...props}
    />
  )
}
