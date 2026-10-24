export function formatBackupDate(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function appendPathSegment(root: string, segment: string): string {
  const trimmed = root.trim().replace(/[\\/]+$/, '')
  const separator = trimmed.includes('\\') ? '\\' : '/'
  return trimmed ? `${trimmed}${separator}${segment}` : segment
}
