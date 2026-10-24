import {
  CalendarDays,
  FolderSearch,
  HardDrive,
  Server,
  Settings2
} from 'lucide-react'
import { appendPathSegment, formatBackupDate } from '../../../shared/backup-path'
import { TransferDashboard } from './transfer-dashboard'
import { Button } from './ui/button'
import { Input } from './ui/input'
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
  const backupDestination =
    mode === 'download' && config.timestampFolder && config.localRoot.trim()
      ? appendPathSegment(config.localRoot, formatBackupDate())
      : ''

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
          {backupDestination && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-background-deep px-3.5 py-2.5 text-sm text-muted-strong">
              <CalendarDays className="size-4 shrink-0 text-primary" />
              <span className="min-w-0">
                本次备份目录
                <span className="ml-2 break-all font-mono text-foreground">
                  {backupDestination}
                </span>
                <span className="mt-1 block text-xs text-muted">
                  会优先复用最近一次日期备份，只下载新增或修改文件。
                </span>
              </span>
            </div>
          )}
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
    </div>
  )
}
