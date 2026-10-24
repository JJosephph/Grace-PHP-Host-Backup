import {
  Ban,
  CheckCircle2,
  CirclePause,
  CloudDownload,
  CloudUpload,
  FolderOpen,
  Gauge,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Timer,
  TriangleAlert
} from 'lucide-react'
import { motion } from 'motion/react'
import type { OperationStatus } from '../../../shared/types'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { formatBytes, formatDuration, formatElapsed } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { useAppStore } from '@renderer/store/use-app-store'

interface TransferDashboardProps {
  mode: 'download' | 'upload'
  onStart: () => void
  onCancel: () => void
  onPause: () => void
  onResume: () => void
  onOpenFolder: () => void
}

const statusText: Record<OperationStatus, string> = {
  idle: '准备就绪',
  connecting: '正在连接',
  'scanning-local': '正在检查本地文件',
  'scanning-remote': '正在检查远端文件',
  preparing: '正在比对历史备份',
  transferring: '正在传输',
  paused: '已暂停',
  completed: '已经完成',
  cancelled: '已取消',
  error: '出现问题'
}

export function TransferDashboard({
  mode,
  onStart,
  onCancel,
  onPause,
  onResume,
  onOpenFolder
}: TransferDashboardProps): React.JSX.Element {
  const status = useAppStore((state) => state.status)
  const scan = useAppStore((state) => state.scanProgress)
  const transfer = useAppStore((state) => state.transferProgress)
  const busy = useAppStore((state) => state.busy)
  const config = useAppStore((state) => state.config)

  const reading = status === 'scanning-local' || status === 'scanning-remote'
  const comparing = status === 'preparing'
  const transferring = status === 'transferring' || status === 'paused'
  const comparePercent =
    comparing && scan?.totalFiles
      ? Math.min(100, (scan.files / scan.totalFiles) * 100)
      : 0
  const percent =
    transferring || status === 'completed'
      ? (transfer?.percent ?? 0)
      : comparing
        ? comparePercent
        : 0
  const indeterminate =
    status === 'connecting' || reading || (comparing && !scan?.totalFiles)
  const tone = status === 'error' ? 'danger' : status === 'paused' ? 'warning' : 'default'
  const currentTitle =
    status === 'connecting'
      ? '正在连接 FTP'
      : status === 'preparing'
        ? '正在比对最近一次日期备份'
        : reading
          ? scan?.currentPath || '正在读取目录...'
          : transfer?.currentFile || (busy ? '正在准备任务...' : '还没有开始任务')
  const activityLabel =
    status === 'idle'
      ? '待机'
      : status === 'connecting'
        ? '连接中'
        : comparing
          ? scan?.totalFiles
            ? `${comparePercent.toFixed(0)}%`
            : '比对中'
          : reading
            ? '扫描中'
            : status === 'completed'
              ? '完成'
              : `${percent.toFixed(1)}%`
  const currentDetail =
    status === 'connecting'
      ? `正在连接 ${config.host || 'FTP 主机'}`
      : comparing
        ? `已比对 ${scan?.files ?? 0} / ${scan?.totalFiles ?? '...'} 个文件`
        : reading
          ? `已发现 ${scan?.directories ?? 0} 个目录、${scan?.files ?? 0} 个文件`
          : transfer
            ? `${transfer.fileIndex} / ${transfer.totalFiles} 个文件 · ${formatBytes(transfer.bytesDone)} / ${formatBytes(transfer.bytesTotal)}`
            : `${config.host || '尚未配置 FTP'} · ${config.remoteRoot}`
  const currentCompareFile =
    scan?.currentPath.split(/[\\/]/).filter(Boolean).at(-1) || '正在读取...'
  const steps =
    mode === 'download'
      ? ['连接 FTP', '扫描远端', '比对历史', '增量备份', '完成']
      : ['连接 FTP', '扫描本地', '比对文件', '上传变化', '完成']
  const activeStep = workflowStep(status)

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-md border border-border bg-background-deep text-primary">
            {mode === 'download' ? (
              <CloudDownload className="size-5" />
            ) : (
              <CloudUpload className="size-5" />
            )}
          </div>
          <div>
            <div className="text-lg font-bold">
              {mode === 'download' ? '备份到本地' : '上传到远端'}
            </div>
            <div className="mt-1 text-sm text-muted">{statusText[status]}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {busy && status === 'transferring' && (
            <Button variant="secondary" onClick={onPause}>
              <Pause className="size-4" />
              暂停
            </Button>
          )}
          {busy && status === 'paused' && (
            <Button variant="secondary" onClick={onResume}>
              <Play className="size-4" />
              继续
            </Button>
          )}
          <Button variant="secondary" onClick={onOpenFolder} disabled={!config.localRoot}>
            <FolderOpen className="size-4" />
            打开目录
          </Button>
          {busy ? (
            <Button variant="destructive" onClick={onCancel}>
              <Ban className="size-4" />
              取消任务
            </Button>
          ) : (
            <Button onClick={onStart} disabled={!config.host || !config.localRoot}>
              {status === 'completed' || status === 'cancelled' || status === 'error' ? (
                <RotateCcw className="size-4" />
              ) : mode === 'download' ? (
                <CloudDownload className="size-4" />
              ) : (
                <CloudUpload className="size-4" />
              )}
              {status === 'completed' || status === 'cancelled' || status === 'error'
                ? '重新开始'
                : mode === 'download'
                  ? '开始备份'
                  : '开始上传'}
            </Button>
          )}
        </div>
      </div>

      <div className="px-5 py-5">
        <div className="mb-3 flex items-end justify-between gap-5">
          <div className="min-w-0">
            <div className="text-base font-semibold text-foreground">{currentTitle}</div>
            <div className="mt-1.5 truncate text-sm text-muted">
              {currentDetail}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-mono text-4xl font-bold tabular-nums">
              {activityLabel}
            </div>
          </div>
        </div>

        <Progress value={percent} indeterminate={indeterminate} tone={tone} className="h-3" />

        <WorkflowTimeline steps={steps} activeStep={activeStep} status={status} />

        <motion.div
          key={reading ? 'scan' : comparing ? 'compare' : transferring ? 'transfer' : status}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-5 grid gap-3 sm:grid-cols-3"
        >
          {comparing ? (
            <>
              <SimpleStat
                label="已比对文件"
                value={`${scan?.files ?? 0} / ${scan?.totalFiles ?? 0}`}
              />
              <SimpleStat label="当前文件" value={currentCompareFile} />
              <SimpleStat label="比对用时" value={formatElapsed(scan?.elapsedMs ?? 0)} />
            </>
          ) : reading ? (
            <>
              <SimpleStat label="已扫描目录" value={String(scan?.directories ?? 0)} />
              <SimpleStat label="已发现文件" value={String(scan?.files ?? 0)} />
              <SimpleStat label="扫描用时" value={formatElapsed(scan?.elapsedMs ?? 0)} />
            </>
          ) : (
            <>
              <SimpleStat
                icon={<Gauge />}
                label="当前速度"
                value={`${formatBytes(transfer?.speed ?? 0)}/s`}
              />
              <SimpleStat
                icon={<Timer />}
                label="预计剩余"
                value={formatDuration(transfer?.etaSeconds ?? null)}
              />
              <SimpleStat
                icon={<CheckCircle2 />}
                label="完成 / 本地复用 / 跳过 / 失败"
                value={`${transfer?.completed ?? 0} / ${transfer?.copied ?? 0} / ${transfer?.skipped ?? 0} / ${transfer?.failed ?? 0}`}
              />
            </>
          )}
        </motion.div>

        {(status === 'paused' || status === 'error' || status === 'cancelled') && (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-background-deep px-4 py-3 text-sm text-muted-strong">
            {status === 'paused' ? (
              <CirclePause className="size-4 text-warning" />
            ) : status === 'error' ? (
              <TriangleAlert className="size-4 text-warning" />
            ) : (
              <Ban className="size-4 text-muted" />
            )}
            {status === 'paused'
              ? '任务已暂停，点击继续后会从当前文件继续。'
              : status === 'cancelled'
                ? '任务已停止，已经下载的文件会保留。'
                : '请查看运行日志中的错误信息，修正后可以重新开始。'}
          </div>
        )}

        {(status === 'connecting' || status === 'preparing') && (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted">
            <LoaderCircle className="size-3.5 animate-spin text-primary" />
            {statusText[status]}，请稍候...
          </div>
        )}
      </div>
    </section>
  )
}

function workflowStep(status: OperationStatus): number {
  switch (status) {
    case 'connecting':
      return 0
    case 'scanning-local':
    case 'scanning-remote':
      return 1
    case 'preparing':
      return 2
    case 'transferring':
    case 'paused':
    case 'cancelled':
    case 'error':
      return 3
    case 'completed':
      return 4
    default:
      return -1
  }
}

function WorkflowTimeline({
  steps,
  activeStep,
  status
}: {
  steps: string[]
  activeStep: number
  status: OperationStatus
}): React.JSX.Element {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
      {steps.map((step, index) => {
        const completed = status === 'completed' || activeStep > index
        const active =
          status !== 'completed' &&
          status !== 'error' &&
          status !== 'cancelled' &&
          activeStep === index
        return (
          <div
            key={step}
            className={cn(
              'rounded-md border px-2.5 py-2',
              completed
                ? 'border-primary/35 bg-primary/10'
                : active
                  ? 'border-primary/45 bg-primary/12'
                  : 'border-border bg-background-deep'
            )}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full border',
                  completed || active
                    ? 'border-primary/45 text-primary'
                    : 'border-border text-muted'
                )}
              >
                {completed ? (
                  <CheckCircle2 className="size-3.5" />
                ) : active ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <span className="font-mono text-[10px]">{index + 1}</span>
                )}
              </span>
              <span
                className={cn(
                  'truncate text-xs',
                  completed || active ? 'text-foreground' : 'text-muted'
                )}
              >
                {step}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SimpleStat({
  icon,
  label,
  value
}: {
  icon?: React.ReactNode
  label: string
  value: string
}): React.JSX.Element {
  return (
    <div className="rounded-md border border-border bg-background-deep px-4 py-3.5">
      <div className="flex items-center gap-2 text-sm text-muted">
        {icon && <span className="[&>svg]:size-4">{icon}</span>}
        {label}
      </div>
      <div className="mt-2 font-mono text-lg font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  )
}
