export function formatBytes(value: number, digits = 1): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = Math.max(0, Number(value) || 0)
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${index === 0 ? Math.round(size) : size.toFixed(digits)} ${units[index]}`
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--'
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  if (minutes > 0) return `${minutes} 分 ${secs} 秒`
  return `${secs} 秒`
}

export function formatElapsed(milliseconds: number): string {
  return formatDuration(milliseconds / 1000)
}

export function formatDate(value?: string): string {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function formatClock(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date)
}

export function parentRemote(path: string): string {
  if (path === '/') return '/'
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  return parts.length ? `/${parts.join('/')}` : '/'
}

export function remoteJoin(root: string, name: string): string {
  const cleanRoot = root === '/' ? '' : root.replace(/\/$/, '')
  return `${cleanRoot}/${name}`.replace(/\/+/g, '/')
}
