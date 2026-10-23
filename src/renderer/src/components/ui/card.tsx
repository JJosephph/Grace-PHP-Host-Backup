import type { HTMLAttributes } from 'react'
import { cn } from '@renderer/lib/utils'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card text-card-foreground shadow-[0_18px_50px_rgba(0,0,0,0.18)]',
        className
      )}
      {...props}
    />
  )
}

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={cn('flex flex-col gap-1 p-4', className)} {...props} />
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>): React.JSX.Element {
  return <h3 className={cn('text-sm font-semibold tracking-normal', className)} {...props} />
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return <p className={cn('text-xs leading-5 text-muted', className)} {...props} />
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={cn('p-4 pt-0', className)} {...props} />
}
