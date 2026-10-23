import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Eye,
  EyeOff,
  GripVertical,
  KeyRound,
  Plus,
  RotateCcw,
  Save,
  ServerCog,
  ShieldCheck,
  Trash2,
  Wifi
} from 'lucide-react'
import { useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Separator } from './ui/separator'
import { Switch } from './ui/switch'
import { Tooltip } from './ui/tooltip'
import { cn } from '@renderer/lib/utils'
import { useAppStore } from '@renderer/store/use-app-store'

const DEFAULT_EXCLUDES = ['.git', 'var/cache', 'var/tmp', 'sql_backup/static_backup_work']

export function SettingsPanel(): React.JSX.Element {
  const config = useAppStore((state) => state.config)
  const patchConfig = useAppStore((state) => state.patchConfig)
  const markSaved = useAppStore((state) => state.markSaved)
  const appendLog = useAppStore((state) => state.appendLog)
  const setConnection = useAppStore((state) => state.setConnection)
  const [showPassword, setShowPassword] = useState(false)
  const [ruleInput, setRuleInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = config.excludePatterns.indexOf(String(active.id))
    const newIndex = config.excludePatterns.indexOf(String(over.id))
    patchConfig({ excludePatterns: arrayMove(config.excludePatterns, oldIndex, newIndex) })
  }

  const addRule = (): void => {
    const value = ruleInput.trim().replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
    if (!value || config.excludePatterns.includes(value)) return
    patchConfig({ excludePatterns: [...config.excludePatterns, value] })
    setRuleInput('')
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const saved = await window.grace.saveConfig(config)
      markSaved(saved)
      appendLog({
        id: `${Date.now()}-settings-saved`,
        time: new Date().toISOString(),
        level: 'success',
        message: 'FTP 与同步设置已保存。'
      })
    } catch (error) {
      appendLog({
        id: `${Date.now()}-settings-save-error`,
        time: new Date().toISOString(),
        level: 'error',
        message: `设置保存失败：${error instanceof Error ? error.message : String(error)}`
      })
    } finally {
      setSaving(false)
    }
  }

  const test = async (): Promise<void> => {
    setTesting(true)
    try {
      const summary = await window.grace.testConnection(config)
      setConnection(summary)
      appendLog({
        id: `${Date.now()}-connection-ok`,
        time: new Date().toISOString(),
        level: 'success',
        message: `连接成功：${config.host}:${config.port}${config.remoteRoot}`
      })
    } catch (error) {
      setConnection(null)
      appendLog({
        id: `${Date.now()}-connection-error`,
        time: new Date().toISOString(),
        level: 'error',
        message: `连接失败：${error instanceof Error ? error.message : String(error)}`
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-6">
      <section className="rounded-lg border border-border bg-surface">
        <SettingsHeader
          icon={<ServerCog />}
          title="FTP 连接"
          description="连接信息只保存在当前电脑，密码使用系统安全存储加密。"
        />
        <div className="grid gap-5 p-5 md:grid-cols-2">
          <Field label="主机地址">
            <Input
              value={config.host}
              onChange={(event) => patchConfig({ host: event.target.value })}
              placeholder="ftp.example.com"
              className="h-12 text-sm"
            />
          </Field>
          <Field label="端口">
            <Input
              type="number"
              min={1}
              max={65535}
              value={config.port}
              onChange={(event) => patchConfig({ port: Number(event.target.value) || 21 })}
              className="h-12 text-sm"
            />
          </Field>
          <Field label="用户名">
            <Input
              value={config.username}
              onChange={(event) => patchConfig({ username: event.target.value })}
              placeholder="ftp-user"
              className="h-12 text-sm"
            />
          </Field>
          <Field label="密码">
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={config.password}
                onChange={(event) => patchConfig({ password: event.target.value })}
                placeholder="不显示，也不会写入日志"
                className="h-12 pr-12 text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-1 top-1/2 -translate-y-1/2"
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </Button>
            </div>
          </Field>
          <Field label="远端目录">
            <Input
              value={config.remoteRoot}
              onChange={(event) => patchConfig({ remoteRoot: event.target.value })}
              placeholder="/"
              className="h-12 font-mono text-sm"
            />
          </Field>
          <Field label="超时时间（秒）">
            <Input
              type="number"
              min={10}
              max={3600}
              value={config.timeout}
              onChange={(event) => patchConfig({ timeout: Number(event.target.value) || 60 })}
              className="h-12 text-sm"
            />
          </Field>
        </div>
        <Separator />
        <div className="flex flex-wrap items-center gap-6 p-5">
          <ToggleLine
            label="保存密码"
            description="使用 Windows 安全存储"
            checked={config.rememberPassword}
            onCheckedChange={(value) => patchConfig({ rememberPassword: value })}
          />
          <ToggleLine
            label="FTPS 加密"
            description="显式 TLS 连接"
            checked={config.tls}
            onCheckedChange={(value) => patchConfig({ tls: value })}
          />
          <ToggleLine
            label="被动模式"
            description="虚拟主机推荐"
            checked={config.passive}
            onCheckedChange={(value) => patchConfig({ passive: value })}
          />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <SettingsHeader
          icon={<ShieldCheck />}
          title="同步策略"
          description="控制跳过规则和排除目录，拖动规则可调整顺序。"
        />
        <div className="grid gap-5 p-5 md:grid-cols-2">
          <ToggleLine
            label="创建时间目录"
            description="备份时自动建立主机名与时间戳目录"
            checked={config.timestampFolder}
            onCheckedChange={(value) => patchConfig({ timestampFolder: value })}
          />
          <ToggleLine
            label="比较修改时间"
            description="大小相同时再比较修改时间"
            checked={config.compareMtime}
            onCheckedChange={(value) => patchConfig({ compareMtime: value })}
          />
          <Field label="失败重试次数">
            <Input
              type="number"
              min={0}
              max={20}
              value={config.retries}
              onChange={(event) => patchConfig({ retries: Number(event.target.value) || 0 })}
            />
          </Field>
          <div className="rounded-md border border-border bg-background-deep p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="size-3.5 text-primary" />
              安全边界
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              软件不会删除远端文件，也不会在失败后留下伪装的完整文件。下载使用 .part
              临时文件，完成后才替换目标。
            </p>
          </div>
        </div>
        <Separator />
        <div className="p-5">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">排除路径</div>
              <div className="mt-1 text-xs text-muted">
                支持精确目录、前缀路径以及 *、? 通配符。
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => patchConfig({ excludePatterns: [...DEFAULT_EXCLUDES] })}
            >
              <RotateCcw className="size-3.5" />
              恢复默认
            </Button>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={config.excludePatterns} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {config.excludePatterns.map((rule) => (
                  <SortableRule
                    key={rule}
                    rule={rule}
                    onRemove={() =>
                      patchConfig({
                        excludePatterns: config.excludePatterns.filter((item) => item !== rule)
                      })
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="mt-3 flex gap-2">
            <Input
              value={ruleInput}
              onChange={(event) => setRuleInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addRule()
              }}
              placeholder="例如 var/cache 或 cache/*"
            />
            <Button variant="secondary" onClick={addRule} disabled={!ruleInput.trim()}>
              <Plus className="size-3.5" />
              添加
            </Button>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={() => void test()} disabled={testing || !config.host}>
          <Wifi className={cn('size-3.5', testing && 'animate-pulse')} />
          {testing ? '测试中...' : '测试连接'}
        </Button>
        <Button onClick={() => void save()} disabled={saving}>
          <Save className="size-3.5" />
          {saving ? '保存中...' : '保存设置'}
        </Button>
      </div>
    </div>
  )
}

function SettingsHeader({
  icon,
  title,
  description
}: {
  icon: React.ReactNode
  title: string
  description: string
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 border-b border-border px-5 py-4">
      <div className="flex size-10 items-center justify-center rounded-md border border-border bg-background-deep text-primary [&>svg]:size-4">
        {icon}
      </div>
      <div>
        <div className="text-lg font-bold">{title}</div>
        <div className="mt-0.5 text-sm text-muted">{description}</div>
      </div>
    </div>
  )
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted-strong">{label}</span>
      {children}
    </label>
  )
}

function ToggleLine({
  label,
  description,
  checked,
  onCheckedChange
}: {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}): React.JSX.Element {
  return (
    <div className="flex min-w-56 items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-0.5 text-xs text-muted">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function SortableRule({
  rule,
  onRemove
}: {
  rule: string
  onRemove: () => void
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rule
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex h-10 items-center gap-2 rounded-md border border-border bg-background-deep px-2.5',
        isDragging && 'border-primary/40 opacity-80'
      )}
    >
      <Tooltip content="拖动调整顺序">
        <button
          type="button"
          className="flex size-7 items-center justify-center text-muted hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
      </Tooltip>
      <span className="min-w-0 flex-1 truncate font-mono text-sm text-muted-strong">{rule}</span>
      <Button variant="ghost" size="icon-sm" onClick={onRemove} title="删除规则">
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}
