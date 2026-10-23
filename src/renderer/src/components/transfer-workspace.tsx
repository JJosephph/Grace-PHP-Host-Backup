import { ChevronDown, ChevronUp, FolderSearch, HardDrive, Server, Settings2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { BrowserPanel } from './browser-panel'
import { TransferDashboard } from './transfer-dashboard'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { cn } from '@renderer/lib/utils'
import { useAppStore } from '@renderer/store/use-app-store'

interface TransferWorkspaceProps {
  mode: 'download' | 'upload'
  onStart: () => void
  onCancel: () => void
  onPause: () => void
  onResume: () => void
  onOpenFolder: () => void
  onChooseLocal: () => void
  onOpenSettings: () => void
}

export function TransferWorkspace({
  mode,
  onStart,
  onCancel,
  onPause,
  onResume,
  onOpenFolder,
  onChooseLocal,
  onOpenSettings
}: TransferWorkspaceProps): React.JSX.Element {
  const config = useAppStore((state) => state.config)
  const patchConfig = useAppStore((state) => state.patchConfig)
  const [showBrowser, setShowBrowser] = useState(false)

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-4">
      <section className="rounded-lg border border-border bg-surface px-5 py-5">
        <div className="mb-4">
          <h2 className="text-lg font-bold">
            {mode === 'download' ? '把网站备份到哪里？' : '要从哪个本地目录上传？'}
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-muted">
            {mode === 'download'
              ? '选择本地保存位置，软件会直接下载远端文件，不压缩整站。'
              : '选择已经备份好的完整目录，软件只上传变化文件。'}
          </p>
        </div>

        <div className="space-y-3">
          <div className="grid items-center gap-3 md:grid-cols-[112px_minmax(0,1fr)_auto]">
            <label className="flex items-center gap-2 text-sm font-medium text-muted-strong">
              <HardDrive className="size-4" />
              本地目录
            </label>
            <Input
              value={config.localRoot}
              onChange={(event) => patchConfig({ localRoot: event.target.value })}
              placeholder="例如 D:\网站备份"
              className="h-12 text-sm"
            />
            <Button variant="secondary" onClick={onChooseLocal}>
              <FolderSearch className="size-4" />
              选择目录
            </Button>
          </div>

          <div className="grid items-center gap-3 md:grid-cols-[112px_minmax(0,1fr)_auto]">
            <label className="flex items-center gap-2 text-sm font-medium text-muted-strong">
              <Server className="size-4" />
              远端目录
            </label>
            <Input
              value={config.remoteRoot}
              onChange={(event) => patchConfig({ remoteRoot: event.target.value })}
              placeholder="/"
              className="h-12 font-mono text-sm"
            />
            <Button variant="ghost" onClick={onOpenSettings}>
              <Settings2 className="size-4" />
              FTP 设置
            </Button>
          </div>
        </div>
      </section>

      <TransferDashboard
        mode={mode}
        onStart={onStart}
        onCancel={onCancel}
        onPause={onPause}
        onResume={onResume}
        onOpenFolder={onOpenFolder}
      />

      <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
        <div>
          <div className="text-base font-semibold">需要检查文件吗？</div>
          <div className="mt-0.5 text-sm text-muted">本地与远端目录可以按需展开。</div>
        </div>
        <Button variant="secondary" onClick={() => setShowBrowser((value) => !value)}>
          {showBrowser ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          {showBrowser ? '收起文件浏览' : '查看文件浏览'}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {showBrowser && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 380 }}
            exit={{ opacity: 0, height: 0 }}
            className="min-h-0 overflow-hidden rounded-lg border border-border bg-surface"
          >
            <PanelGroup direction="horizontal" className="h-full">
              <Panel defaultSize={50} minSize={30}>
                <BrowserPanel kind="local" rootPath={config.localRoot} />
              </Panel>
              <PanelResizeHandle
                className={cn(
                  'group relative w-px bg-border transition',
                  'after:absolute after:inset-y-0 after:-left-1.5 after:w-3',
                  'hover:bg-primary/50 data-[resize-handle-active]:bg-primary'
                )}
              />
              <Panel defaultSize={50} minSize={30}>
                <BrowserPanel kind="remote" />
              </Panel>
            </PanelGroup>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
