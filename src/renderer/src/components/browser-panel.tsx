import {
  ArrowUp,
  Clock3,
  File,
  Folder,
  FolderOpen,
  HardDrive,
  Link2,
  LoaderCircle,
  RefreshCw,
  Server
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LocalEntry, RemoteEntry } from '../../../shared/types'
import { Button } from './ui/button'
import { formatBytes, formatDate, parentRemote } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { useAppStore } from '@renderer/store/use-app-store'

type BrowserEntry = RemoteEntry | LocalEntry

interface BrowserPanelProps {
  kind: 'local' | 'remote'
  rootPath?: string
}

function isRemote(entry: BrowserEntry): entry is RemoteEntry {
  return 'path' in entry
}

function rowPath(entry: BrowserEntry): string {
  return isRemote(entry) ? entry.path : entry.path
}

export function BrowserPanel({ kind, rootPath }: BrowserPanelProps): React.JSX.Element {
  const config = useAppStore((state) => state.config)
  const appendLog = useAppStore((state) => state.appendLog)
  const [path, setPath] = useState(kind === 'remote' ? config.remoteRoot : rootPath ?? '')
  const [parent, setParent] = useState<string | null>(null)
  const [entries, setEntries] = useState<BrowserEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const loadedKey = useRef('')

  useEffect(() => {
    if (kind === 'remote') setPath(config.remoteRoot)
  }, [config.remoteRoot, kind])

  useEffect(() => {
    if (kind === 'local' && rootPath) setPath(rootPath)
  }, [kind, rootPath])

  const load = useCallback(
    async (targetPath?: string, force = false) => {
      const target = targetPath ?? path
      if (!target) {
        setEntries([])
        setError('')
        return
      }
      if (kind === 'remote' && (!config.host.trim() || !config.username.trim())) {
        setEntries([])
        setError('')
        return
      }
      const key = `${kind}:${target}:${config.host}:${config.username}`
      if (!force && loadedKey.current === key && entries.length > 0) return

      setLoading(true)
      setError('')
      try {
        if (kind === 'remote') {
          const result = await window.grace.browseRemote({ config, path: target })
          setPath(result.path)
          setParent(parentRemote(result.path))
          setEntries(result.entries)
        } else {
          const result = await window.grace.browseLocal(target)
          setPath(result.path)
          setParent(result.parent)
          setEntries(result.entries)
        }
        loadedKey.current = key
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : String(loadError)
        setError(message)
        setEntries([])
        if (kind === 'remote') {
          appendLog({
            id: `${Date.now()}-remote-browser-error`,
            time: new Date().toISOString(),
            level: 'error',
            message: `远端浏览失败：${message}`
          })
        }
      } finally {
        setLoading(false)
      }
    },
    [appendLog, config, entries.length, kind, path]
  )

  useEffect(() => {
    if (!path) return
    void load(path)
  }, [load, path])

  const totalBytes = useMemo(
    () => entries.reduce((sum, entry) => sum + (entry.isDirectory ? 0 : entry.size), 0),
    [entries]
  )

  const handleEntry = (entry: BrowserEntry): void => {
    if (!entry.isDirectory) return
    void load(entry.path)
  }

  const handleUp = (): void => {
    if (parent) void load(parent)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background-deep">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3.5">
        <div className="flex size-8 items-center justify-center rounded-md border border-border bg-surface-strong text-muted-strong">
          {kind === 'remote' ? <Server className="size-4" /> : <HardDrive className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {kind === 'remote' ? '远端文件' : '本地目录'}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <FolderOpen className="size-3.5 shrink-0" />
            <span className="truncate font-mono">
              {kind === 'remote'
                ? `${config.host || '未连接'}:${config.port}${path || '/'}`
                : path || '尚未选择目录'}
            </span>
          </div>
        </div>
        <span className="text-xs tabular-nums text-muted">
          {entries.length} 项 · {formatBytes(totalBytes)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleUp}
          disabled={!parent || loading}
          title="返回上一级"
        >
          <ArrowUp className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void load(path, true)}
          disabled={!path || loading}
          title="刷新"
        >
          {loading ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
        </Button>
      </div>

      <div className="grid h-8 shrink-0 grid-cols-[minmax(0,1fr)_100px_140px] items-center border-b border-border bg-surface px-3.5 text-xs uppercase tracking-[0.04em] text-muted">
        <span>名称</span>
        <span className="text-right">大小</span>
        <span className="text-right">修改时间</span>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto overscroll-contain">
        {loading && entries.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-muted">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            正在读取目录...
          </div>
        )}

        {!loading && !path && (
          <EmptyState
            icon={<FolderOpen className="size-6" />}
            title={kind === 'local' ? '请先选择本地目录' : '请先填写 FTP 连接'}
          />
        )}

        {!loading && path && entries.length === 0 && !error && (
          <EmptyState icon={<Folder className="size-6" />} title="目录为空" />
        )}

        {error && (
          <div className="m-3 rounded-md border border-[#7f3a45] bg-[#35171d] p-3.5 text-sm leading-6 text-[#ffb0b8]">
            {error}
          </div>
        )}

        <AnimatePresence initial={false}>
          {entries.map((entry, index) => (
            <motion.button
              key={rowPath(entry)}
              type="button"
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.004, 0.08) }}
              onClick={() => handleEntry(entry)}
              className={cn(
                'grid h-10 w-full grid-cols-[minmax(0,1fr)_100px_140px] items-center border-b border-border/70 px-3.5 text-left transition hover:bg-surface-hover',
                entry.isDirectory && 'cursor-pointer'
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                {entry.isDirectory ? (
                    <Folder className="size-4 shrink-0 fill-primary/10 text-primary" />
                ) : (
                  <File className="size-4 shrink-0 text-muted" />
                )}
                <span className="truncate text-sm text-foreground">{entry.name}</span>
                {entry.isSymbolicLink && <Link2 className="size-3 shrink-0 text-warning" />}
              </span>
              <span className="text-right font-mono text-xs tabular-nums text-muted">
                {entry.isDirectory ? '目录' : formatBytes(entry.size)}
              </span>
              <span className="flex items-center justify-end gap-1 text-right font-mono text-xs text-muted">
                <Clock3 className="size-3" />
                {formatDate(entry.modifiedAt)}
              </span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

function EmptyState({
  icon,
  title
}: {
  icon: React.ReactNode
  title: string
}): React.JSX.Element {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 text-muted">
      <div className="flex size-11 items-center justify-center rounded-lg border border-border bg-surface">
        {icon}
      </div>
      <span className="text-sm">{title}</span>
    </div>
  )
}
