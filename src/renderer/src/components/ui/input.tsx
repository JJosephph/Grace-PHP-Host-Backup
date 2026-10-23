import type { InputHTMLAttributes } from 'react'
import { cn } from '@renderer/lib/utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return (
    <input
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-[#090c11] px-3 py-1 text-sm text-foreground shadow-inner shadow-black/20 outline-none transition placeholder:text-muted/70 focus:border-primary/55 focus:ring-2 focus:ring-primary/10 disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}
