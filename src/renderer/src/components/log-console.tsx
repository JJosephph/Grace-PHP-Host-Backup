import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Info,
  Trash2,
  TriangleAlert,
  XCircle
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { formatClock } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { useAppStore } from '@renderer/store/use-app-store'

export function LogConsole(): React.JSX.Element {
  const logs = useAppStore((state) => state.logs)
  const clearLogs = useAppStore((state) => state.clearLogs)
  const [collapsed, setCollapsed] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (collapsed) return
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [collapsed, logs])

  const copyAll = async (): Promise<void> => {
    const text = logs
      .map((entry) => `[${formatClock(entry.time)}] ${entry.level.toUpperCase()} ${entry.message}`)
      .join('\n')
    await navigator.clipboard.writeText(text)
  }

  return (
    <section
      className={cn(
        'flex min-h-0 shrink-0 flex-col border-t border-border bg-[#080a0e]',
        collapsed ? 'h-11' : 'h-52'
      )}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(105,230,196,0.75)]" />
          <span className="text-xs font-medium">运行日志</span>
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted">
            {logs.length}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void copyAll()}
            disabled={logs.length === 0}
            title="复制全部日志"
          >
            <Clipboard className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={clearLogs}
            disabled={logs.length === 0}
            title="清空日志"
          >
            <Trash2 className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCollapsed((value) => !value)}
            title={collapsed ? '展开日志' : '收起日志'}
          >
            {collapsed ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </Button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            ref={scrollRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-0 flex-1 overflow-auto px-4 py-2.5 font-mono text-[11px] leading-5"
          >
            {logs.length === 0 ? (
              <div className="flex h-full items-center justify-center text-muted">
                连接、扫描和传输状态会显示在这里
              </div>
            ) : (
              logs.map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-[72px_16px_minmax(0,1fr)] items-start gap-1.5"
                >
                  <span className="tabular-nums text-[#657083]">{formatClock(entry.time)}</span>
                  <LogIcon level={entry.level} />
                  <span
                    className={cn(
                      'break-all',
                      entry.level === 'error'
                        ? 'text-[#ff9aa3]'
                        : entry.level === 'warning'
                          ? 'text-warning'
                          : entry.level === 'success'
                            ? 'text-primary'
                            : 'text-[#b8c1ce]'
                    )}
                  >
                    {entry.message}
                  </span>
                </div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function LogIcon({ level }: { level: 'info' | 'success' | 'warning' | 'error' }): React.JSX.Element {
  if (level === 'success') return <CheckCircle2 className="mt-0.5 size-3 text-primary" />
  if (level === 'warning') return <TriangleAlert className="mt-0.5 size-3 text-warning" />
  if (level === 'error') return <XCircle className="mt-0.5 size-3 text-[#ff6b78]" />
  return <Info className="mt-0.5 size-3 text-accent" />
}
