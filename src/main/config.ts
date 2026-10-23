import { app, safeStorage } from 'electron'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AppConfig, StoredConfig } from '../shared/types'

const DEFAULT_EXCLUDES = [
  '.git',
  'var/cache',
  'var/tmp',
  'sql_backup/static_backup_work'
]

export const DEFAULT_CONFIG: AppConfig = {
  host: '',
  port: 21,
  username: '',
  password: '',
  rememberPassword: false,
  remoteRoot: '/',
  passive: true,
  tls: false,
  localRoot: '',
  timestampFolder: true,
  compareMtime: false,
  retries: 3,
  timeout: 60,
  excludePatterns: DEFAULT_EXCLUDES
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

function legacyConfigPath(): string | null {
  const candidates = [
    process.env.PORTABLE_EXECUTABLE_DIR
      ? join(process.env.PORTABLE_EXECUTABLE_DIR, 'grace-php-host-backup.json')
      : '',
    join(dirname(process.execPath), 'grace-php-host-backup.json'),
    join(app.getPath('desktop'), 'grace-php-host-backup.json'),
    join(process.cwd(), 'grace-php-host-backup.json')
  ].filter(Boolean)
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function normalizeRemote(path: string): string {
  const value = (path || '/').replaceAll('\\', '/').trim()
  const normalized = `/${value}`.replace(/\/+/g, '/')
  if (normalized === '/') return '/'
  return normalized.replace(/\/$/, '') || '/'
}

function sanitize(raw: Partial<StoredConfig> | Partial<AppConfig>): AppConfig {
  const record = raw as Record<string, unknown>
  const excludes = Array.isArray(record.excludePatterns)
    ? record.excludePatterns.map(String).map((item) => item.trim()).filter(Boolean)
    : DEFAULT_EXCLUDES

  return {
    host: String(record.host ?? ''),
    port: Math.max(1, Math.min(65535, Number(record.port) || 21)),
    username: String(record.username ?? ''),
    password: typeof record.password === 'string' ? record.password : '',
    rememberPassword: Boolean(record.rememberPassword),
    remoteRoot: normalizeRemote(String(record.remoteRoot ?? '/')),
    passive: record.passive !== false,
    tls: Boolean(record.tls),
    localRoot: String(record.localRoot ?? ''),
    timestampFolder: record.timestampFolder !== false,
    compareMtime: Boolean(record.compareMtime),
    retries: Math.max(0, Math.min(20, Number(record.retries) || 0)),
    timeout: Math.max(10, Math.min(3600, Number(record.timeout) || 60)),
    excludePatterns: excludes
  }
}

function decryptPassword(value: string): string {
  if (!value) return ''
  if (value.startsWith('dpapi:') && process.platform === 'win32') {
    return decryptLegacyDpapi(value.slice(6))
  }
  try {
    if (!safeStorage.isEncryptionAvailable()) return ''
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    return ''
  }
}

function decryptLegacyDpapi(payload: string): string {
  try {
    const script = [
      "Add-Type -AssemblyName System.Security",
      "$data=[Convert]::FromBase64String($env:GRACE_LEGACY_PAYLOAD)",
      "$entropy=[Text.Encoding]::UTF8.GetBytes('Grace-PHP-Host-Backup-v0.1')",
      "$plain=[Security.Cryptography.ProtectedData]::Unprotect($data,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)",
      '[Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))'
    ].join(';')
    return execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10_000,
        env: {
          ...process.env,
          GRACE_LEGACY_PAYLOAD: payload
        }
      }
    )
  } catch {
    return ''
  }
}

function encryptPassword(value: string): string {
  if (!value) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('当前系统无法使用安全密码存储。')
  }
  return safeStorage.encryptString(value).toString('base64')
}

export async function loadConfig(): Promise<AppConfig> {
  const primary = configPath()
  const legacy = legacyConfigPath()
  let path = existsSync(primary) ? primary : legacy
  if (existsSync(primary) && legacy) {
    try {
      const current = JSON.parse(await readFile(primary, 'utf8')) as Record<string, unknown>
      const missingHost = !String(current.host ?? '').trim()
      const missingPassword =
        Boolean(current.rememberPassword) && !String(current.passwordEncrypted ?? '').trim()
      if (missingHost || missingPassword) path = legacy
    } catch {
      path = legacy
    }
  }
  if (!path) return { ...DEFAULT_CONFIG, excludePatterns: [...DEFAULT_EXCLUDES] }

  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as Partial<StoredConfig> &
      Record<string, unknown>
    const normalized: Partial<StoredConfig> = {
      ...raw,
      rememberPassword: Boolean(raw.rememberPassword ?? raw.remember_password),
      remoteRoot: String(raw.remoteRoot ?? raw.remote_root ?? '/'),
      timestampFolder: Boolean(raw.timestampFolder ?? raw.timestamp_folder ?? true),
      compareMtime: Boolean(raw.compareMtime ?? raw.compare_mtime),
      excludePatterns: Array.isArray(raw.excludePatterns)
        ? raw.excludePatterns.map(String)
        : Array.isArray(raw.exclude_patterns)
          ? raw.exclude_patterns.map(String)
          : undefined,
      passwordEncrypted: String(raw.passwordEncrypted ?? raw.password_encrypted ?? '')
    }
    const config = sanitize(normalized)
    config.password = decryptPassword(String(normalized.passwordEncrypted ?? ''))
    if (path !== primary) {
      await saveConfig(config)
    }
    return config
  } catch {
    return { ...DEFAULT_CONFIG, excludePatterns: [...DEFAULT_EXCLUDES] }
  }
}

export async function saveConfig(config: AppConfig): Promise<AppConfig> {
  const sanitized = sanitize(config)
  const stored: StoredConfig = {
    ...sanitized,
    passwordEncrypted: sanitized.rememberPassword
      ? encryptPassword(config.password)
      : ''
  }
  delete (stored as Partial<AppConfig>).password

  const target = configPath()
  await mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.tmp`
  await writeFile(temporary, JSON.stringify(stored, null, 2), 'utf8')
  await rename(temporary, target)
  return sanitized
}
