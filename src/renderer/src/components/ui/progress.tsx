import { motion } from 'motion/react'
import { cn } from '@renderer/lib/utils'

interface ProgressProps {
  value?: number
  indeterminate?: boolean
  className?: string
  tone?: 'default' | 'warning' | 'danger'
}

export function Progress({
  value = 0,
  indeterminate = false,
  className,
  tone = 'default'
}: ProgressProps): React.JSX.Element {
  const safeValue = Math.max(0, Math.min(100, value))
  const color =
    tone === 'danger' ? 'bg-destructive' : tone === 'warning' ? 'bg-warning' : 'bg-primary'
  return (
    <div
      className={cn(
        'relative h-1.5 w-full overflow-hidden rounded-full bg-[#1d232d]',
        indeterminate && 'indeterminate-track',
        className
      )}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : safeValue}
    >
      {!indeterminate && (
        <motion.div
          className={cn('h-full rounded-full', color)}
          initial={false}
          animate={{ width: `${safeValue}%` }}
          transition={{ type: 'spring', stiffness: 170, damping: 24 }}
        />
      )}
    </div>
  )
}
