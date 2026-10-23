import {
  CloudDownload,
  CloudUpload,
  FolderTree,
  Github,
  Heart,
  LoaderCircle,
  MessageCircle,
  RadioTower,
  Settings2,
  ShieldCheck,
  Star,
  UserRound,
  Wifi,
  WifiOff
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo } from 'react'
import { BrowserPanel } from './components/browser-panel'
import { LogConsole } from './components/log-console'
import { SettingsPanel } from './components/settings-panel'
import { TransferWorkspace } from './components/transfer-workspace'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Tooltip, TooltipProvider } from './components/ui/tooltip'
import { cn } from './lib/utils'
import { useAppStore, type AppView } from './store/use-app-store'

const navItems: Array<{
  id: AppView
  label: string
  description: string
  icon: React.ReactNode
}> = [
  {
    id: 'backup',
    label: '一键备份',
    description: '远端下载到本地',
    icon: <CloudDownload />
  },
  {
    id: 'upload',
    label: '上传迁移',
    description: '本地上传到远端',
    icon: <CloudUpload />
  },
  {
    id: 'remote',
    label: '远端浏览',
    description: '查看远端文件',
    icon: <FolderTree />
  },
  {
    id: 'settings',
    label: '连接设置',
    description: 'FTP 与同步策略',
    icon: <Settings2 />
  }
]

const viewMeta: Record<AppView, { title: string; description: string }> = {
  backup: {
    title: '一键备份',
    description: '从 FTP 远端直接下载完整目录，保留目录结构，不压缩整站。'
  },
  upload: {
    title: '上传迁移',
    description: '把本地完整目录上传到 FTP，只覆盖变化文件，不删除远端内容。'
  },
  remote: {
    title: '远端浏览',
    description: '直接检查远端目录、文件大小和修改时间，不再依赖盲传。'
  },
  settings: {
    title: '连接设置',
    description: '维护 FTP 连接、同步策略、排除规则和安全存储。'
  }
}

export function App(): React.JSX.Element {
  const view = useAppStore((state) => state.view)
  const setView = useAppStore((state) => state.setView)
  const config = useAppStore((state) => state.config)
  const savedConfig = useAppStore((state) => state.savedConfig)
  const connection = useAppStore((state) => state.connection)
  const busy = useAppStore((state) => state.busy)
  const ready = useAppStore((state) => state.ready)
  const setConfig = useAppStore((state) => state.setConfig)
  const markSaved = useAppStore((state) => state.markSaved)
  const setStatus = useAppStore((state) => state.setStatus)
  const setBusy = useAppStore((state) => state.setBusy)
  const setScanProgress = useAppStore((state) => state.setScanProgress)
  const setTransferProgress = useAppStore((state) => state.setTransferProgress)
  const appendLog = useAppStore((state) => state.appendLog)
  const patchConfig = useAppStore((state) => state.patchConfig)
  const setReady = useAppStore((state) => state.setReady)

  useEffect(() => {
    const unsubscribeLog = window.grace.onLog(appendLog)
    const unsubscribeStatus = window.grace.onStatus((nextStatus) => {
      setStatus(nextStatus)
      if (nextStatus === 'idle' || nextStatus === 'completed' || nextStatus === 'cancelled' || nextStatus === 'error') {
        setBusy(false)
      }
    })
    const unsubscribeScan = window.grace.onScanProgress(setScanProgress)
    const unsubscribeTransfer = window.grace.onTransferProgress((progress) => {
      setTransferProgress(progress)
      setBusy(true)
      setStatus(progress.status)
    })

    void window.grace
      .loadConfig()
      .then((loaded) => {
        setConfig(loaded)
        markSaved(loaded)
        setReady(true)
      })
      .catch((error) => {
        setReady(true)
        appendLog({
          id: `${Date.now()}-config-load-error`,
          time: new Date().toISOString(),
          level: 'error',
          message: `读取设置失败：${error instanceof Error ? error.message : String(error)}`
        })
      })

    return () => {
      unsubscribeLog()
      unsubscribeStatus()
      unsubscribeScan()
      unsubscribeTransfer()
    }
  }, [
    appendLog,
    markSaved,
    setBusy,
    setConfig,
    setReady,
    setScanProgress,
    setStatus,
    setTransferProgress
  ])

  const dirty = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(savedConfig),
    [config, savedConfig]
  )

  const handleStart = async (mode: 'download' | 'upload'): Promise<void> => {
    if (!config.host.trim() || !config.username.trim()) {
      setView('settings')
      return
    }
    if (!config.localRoot.trim()) return
    if (
      mode === 'upload' &&
      !window.confirm('确认开始上传迁移？同名变化文件会被覆盖，但远端多余文件不会被删除。')
    ) {
      return
    }

    setBusy(true)
    setStatus('connecting')
    setScanProgress(null)
    setTransferProgress(null)
    try {
      const saved = await window.grace.saveConfig(config)
      markSaved(saved)
      const result = await window.grace.startTransfer({
        mode,
        config: saved,
        localRoot: saved.localRoot
      })
      appendLog({
        id: `${Date.now()}-result`,
        time: new Date().toISOString(),
        level: result.failures.length > 0 ? 'warning' : 'success',
        message: `任务完成：计划 ${result.files} 个，成功 ${result.completed} 个，跳过 ${result.skipped} 个，失败 ${result.failures.length} 个。`
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('取消')) {
        appendLog({
          id: `${Date.now()}-transfer-error`,
          time: new Date().toISOString(),
          level: 'error',
          message
        })
      }
    } finally {
      setBusy(false)
    }
  }

  const chooseLocal = async (): Promise<void> => {
    const selected = await window.grace.chooseLocalDirectory(config.localRoot)
    if (selected) patchConfig({ localRoot: selected })
  }

  const openFolder = async (): Promise<void> => {
    if (!config.localRoot) return
    try {
      await window.grace.openPath(config.localRoot)
    } catch (error) {
      appendLog({
        id: `${Date.now()}-open-path-error`,
        time: new Date().toISOString(),
        level: 'error',
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  const openProject = async (): Promise<void> => {
    try {
      await window.grace.openExternal('https://github.com/JJosephph/Grace-PHP-Host-Backup')
    } catch (error) {
      appendLog({
        id: `${Date.now()}-open-project-error`,
        time: new Date().toISOString(),
        level: 'error',
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted">
          <LoaderCircle className="size-4 animate-spin text-primary" />
          正在载入设置...
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex h-full w-full overflow-hidden bg-background">
        <aside className="flex w-[252px] shrink-0 flex-col overflow-y-auto border-r border-border bg-background-deep">
          <div className="flex h-20 items-center gap-3 border-b border-border px-5">
            <div className="relative flex size-11 items-center justify-center rounded-lg border border-primary/35 bg-primary/12 text-primary">
              <ShieldCheck className="size-5" />
              <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-background-deep bg-primary" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-bold tracking-normal">恩典主机备份</div>
              <div className="mt-0.5 font-mono text-xs uppercase tracking-[0.1em] text-muted">
                Grace Backup
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-2 p-3">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={cn(
                  'group relative flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition',
                  view === item.id
                    ? 'border-primary/35 bg-primary/12 text-foreground'
                    : 'border-transparent text-muted-strong hover:border-border hover:bg-surface-hover hover:text-foreground'
                )}
              >
                {view === item.id && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary"
                  />
                )}
                <span className="[&>svg]:size-[18px] shrink-0">{item.icon}</span>
                <span className="min-w-0 text-sm font-medium">{item.label}</span>
                {item.id === 'settings' && !config.host && (
                  <span className="ml-auto size-1.5 rounded-full bg-warning" />
                )}
              </button>
            ))}
          </nav>

          <div className="space-y-3 p-3">
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center gap-3">
              <span
                className={cn(
                  'flex size-9 items-center justify-center rounded-md border',
                  connection || config.host
                    ? 'border-primary/35 bg-primary/12 text-primary'
                    : 'border-border bg-background-deep text-muted'
                )}
              >
                {connection || config.host ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {config.host || '尚未配置 FTP'}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted">
                  {config.host ? `${config.username || '未填写账号'} · ${config.remoteRoot}` : '请先完成连接设置'}
                </div>
              </div>
            </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <span className="font-mono text-xs text-muted">v0.2.3</span>
                <span className={cn('text-xs', dirty ? 'text-warning' : 'text-muted')}>
                  {dirty ? '有未保存修改' : '设置已同步'}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start gap-2.5">
                <Heart className="mt-0.5 size-4 shrink-0 text-danger" />
                <div>
                  <div className="text-sm font-bold">开源免费 · 求个 Star</div>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    如果它帮你节省了时间，欢迎到 GitHub 点个 Star。
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3 w-full"
                onClick={() => void openProject()}
              >
                <Github className="size-4" />
                <Star className="size-3.5 text-warning" />
                GitHub 点个 Star
              </Button>
              <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs text-muted-strong">
                <div className="flex items-center gap-2">
                  <UserRound className="size-3.5 text-primary" />
                  开发者：WangYufan
                </div>
                <div className="flex items-center gap-2">
                  <MessageCircle className="size-3.5 text-accent" />
                  QQ：1471056247
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-20 shrink-0 items-center gap-4 border-b border-border bg-background-deep/95 px-6 backdrop-blur">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-normal">{viewMeta[view].title}</h1>
                <Badge variant={busy ? 'default' : 'neutral'}>
                  {busy ? <LoaderCircle className="size-3 animate-spin" /> : <RadioTower className="size-3" />}
                  {busy ? '任务运行中' : '就绪'}
                </Badge>
              </div>
              <p className="mt-1 truncate text-sm text-muted">{viewMeta[view].description}</p>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip content={connection ? `最近连接 ${connection.host}` : '尚未测试连接'}>
                <div
                  className={cn(
                    'flex h-9 items-center gap-2 rounded-md border px-3 text-sm',
                    connection
                      ? 'border-primary/35 bg-primary/12 text-primary'
                      : 'border-border bg-surface text-muted'
                  )}
                >
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      connection ? 'bg-primary' : 'bg-border-strong'
                    )}
                  />
                  {connection ? '连接正常' : '等待连接'}
                </div>
              </Tooltip>
              <Button variant="ghost" size="icon" onClick={() => setView('settings')} title="连接设置">
                <Settings2 className="size-4" />
              </Button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className="h-full min-h-0"
              >
                {view === 'backup' && (
                  <TransferWorkspace
                    mode="download"
                    onStart={() => void handleStart('download')}
                    onCancel={() => void window.grace.cancelTransfer()}
                    onPause={() => void window.grace.pauseTransfer()}
                    onResume={() => void window.grace.resumeTransfer()}
                    onOpenFolder={() => void openFolder()}
                    onChooseLocal={() => void chooseLocal()}
                    onOpenSettings={() => setView('settings')}
                  />
                )}
                {view === 'upload' && (
                  <TransferWorkspace
                    mode="upload"
                    onStart={() => void handleStart('upload')}
                    onCancel={() => void window.grace.cancelTransfer()}
                    onPause={() => void window.grace.pauseTransfer()}
                    onResume={() => void window.grace.resumeTransfer()}
                    onOpenFolder={() => void openFolder()}
                    onChooseLocal={() => void chooseLocal()}
                    onOpenSettings={() => setView('settings')}
                  />
                )}
                {view === 'remote' && (
                  <div className="h-full min-h-0 overflow-hidden rounded-lg border border-border bg-surface">
                    <BrowserPanel kind="remote" />
                  </div>
                )}
                {view === 'settings' && <SettingsPanel />}
              </motion.div>
            </AnimatePresence>
          </div>

          <LogConsole />
        </main>
      </div>
    </TooltipProvider>
  )
}
