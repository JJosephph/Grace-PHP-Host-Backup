import { Client, type FileInfo } from 'basic-ftp'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, stat, unlink } from 'node:fs/promises'
import { dirname, join, posix, resolve } from 'node:path'
import { Transform, Writable } from 'node:stream'
import type {
  AppConfig,
  BrowseResult,
  ConnectionSummary,
  LocalBrowseResult,
  LocalEntry,
  LogEntry,
  OperationMode,
  OperationStatus,
  RemoteEntry,
  ScanProgress,
  TransferProgress,
  TransferResult
} from '../shared/types'

const BLOCK_SIZE = 1024 * 1024
const PROGRESS_INTERVAL_MS = 120

type LogLevel = LogEntry['level']
type LogHandler = (level: LogLevel, message: string) => void
type StatusHandler = (status: OperationStatus) => void
type ScanHandler = (progress: ScanProgress) => void
type TransferHandler = (progress: TransferProgress) => void

interface TransferTask {
  relative: string
  source: string
  target: string
  size: number
  modifiedAt?: Date
}

interface ScanResult {
  entries: Map<string, RemoteEntry>
  directories: number
  files: number
  bytes: number
}

class TransferCancelled extends Error {
  constructor() {
    super('任务已取消。')
    this.name = 'TransferCancelled'
  }
}

class ProgressTracker {
  private readonly startedAt = Date.now()
  private lastEmitAt = 0
  private lastSampleAt = this.startedAt
  private lastSampleBytes = 0
  private speed = 0

  constructor(private readonly totalBytes: number) {}

  snapshot(done: number): Pick<
    TransferProgress,
    'bytesDone' | 'bytesTotal' | 'percent' | 'speed' | 'etaSeconds'
  > {
    const now = Date.now()
    const sampleElapsed = (now - this.lastSampleAt) / 1000
    if (sampleElapsed >= 0.35) {
      const instant = Math.max(0, done - this.lastSampleBytes) / sampleElapsed
      this.speed = this.speed === 0 ? instant : this.speed * 0.7 + instant * 0.3
      this.lastSampleAt = now
      this.lastSampleBytes = done
    }
    const remaining = Math.max(0, this.totalBytes - done)
    const etaSeconds = this.speed > 1 ? remaining / this.speed : null
    return {
      bytesDone: done,
      bytesTotal: this.totalBytes,
      percent: this.totalBytes > 0 ? Math.min(100, (done / this.totalBytes) * 100) : 100,
      speed: this.speed,
      etaSeconds
    }
  }

  shouldEmit(force = false): boolean {
    const now = Date.now()
    if (!force && now - this.lastEmitAt < PROGRESS_INTERVAL_MS) return false
    this.lastEmitAt = now
    return true
  }

  elapsedMs(): number {
    return Date.now() - this.startedAt
  }
}

export class TransferController {
  cancelled = false
  paused = false
  private client: Client | null = null

  attach(client: Client | null): void {
    this.client = client
  }

  async waitIfPaused(): Promise<void> {
    this.throwIfCancelled()
    while (this.paused && !this.cancelled) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 120))
    }
    this.throwIfCancelled()
  }

  throwIfCancelled(): void {
    if (this.cancelled) throw new TransferCancelled()
  }

  cancel(): void {
    this.cancelled = true
    this.paused = false
    this.client?.close()
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
  }

  reset(): void {
    this.cancelled = false
    this.paused = false
    this.client = null
  }
}

function normalizeRemote(path: string): string {
  const value = (path || '/').replaceAll('\\', '/').trim()
  const normalized = posix.normalize(`/${value}`)
  if (normalized === '.') return '/'
  return normalized === '/' ? '/' : normalized.replace(/\/$/, '')
}

function joinRemote(root: string, relativePath: string): string {
  const relative = relativePath.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  return normalizeRemote(relative ? posix.join(root, relative) : root)
}

function wildcardRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replaceAll('*', '.*').replaceAll('?', '.')}$`)
}

export function shouldExclude(relativePath: string, patterns: string[]): boolean {
  const relativeValue = relativePath.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  return patterns.some((rawPattern) => {
    const pattern = rawPattern.trim().replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
    if (!pattern) return false
    if (relativeValue === pattern || relativeValue.startsWith(`${pattern}/`)) return true
    if (pattern.includes('*') || pattern.includes('?')) {
      return wildcardRegex(pattern).test(relativeValue)
    }
    return false
  })
}

function toRemoteEntry(root: string, info: FileInfo): RemoteEntry {
  return {
    name: info.name,
    path: joinRemote(root, info.name),
    isDirectory: info.isDirectory,
    isSymbolicLink: info.isSymbolicLink,
    size: info.isDirectory ? 0 : info.size,
    modifiedAt: info.modifiedAt?.toISOString(),
    rawModifiedAt: info.rawModifiedAt
  }
}

function sortEntries<T extends { name: string; isDirectory: boolean }>(entries: T[]): T[] {
  return entries.sort((left, right) => {
    if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1
    return left.name.localeCompare(right.name, 'zh-CN', { numeric: true })
  })
}

function isSameMtime(localMs: number, remoteDate?: Date): boolean {
  if (!remoteDate) return true
  return Math.abs(localMs - remoteDate.getTime()) <= 120_000
}

async function setLocalMtime(path: string, date?: Date): Promise<void> {
  if (!date) return
  try {
    const { utimes } = await import('node:fs/promises')
    await utimes(path, date, date)
  } catch {
    // 部分文件系统不支持修改时间，不影响备份内容。
  }
}

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  } catch {
    return 0
  }
}

class CountingWritable extends Writable {
  private readonly output: ReturnType<typeof createWriteStream>
  private bytes = 0

  constructor(
    path: string,
    private readonly controller: TransferController,
    private readonly onBytes: (amount: number) => void
  ) {
    super()
    this.output = createWriteStream(path, { flags: 'a' })
  }

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    void (async () => {
      try {
        await this.controller.waitIfPaused()
        await new Promise<void>((resolvePromise, reject) => {
          this.output.write(chunk, (error) => {
            if (error) reject(error)
            else resolvePromise()
          })
        })
        this.bytes += chunk.length
        this.onBytes(chunk.length)
        callback()
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)))
      }
    })()
  }

  override _final(callback: (error?: Error | null) => void): void {
    this.output.end(callback)
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    this.output.destroy()
    callback(error)
  }
}

class CountingTransform extends Transform {
  constructor(
    private readonly controller: TransferController,
    private readonly onBytes: (amount: number) => void
  ) {
    super({ highWaterMark: BLOCK_SIZE })
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer) => void
  ): void {
    void (async () => {
      try {
        await this.controller.waitIfPaused()
        this.onBytes(chunk.length)
        callback(null, chunk)
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)))
      }
    })()
  }
}

export class FtpService {
  private readonly log: LogHandler
  private readonly onStatus: StatusHandler
  private readonly onScan: ScanHandler
  private readonly onTransfer: TransferHandler
  private client: Client | null = null
  private configFingerprint = ''
  private connectedAt = ''
  private activeTransfer = false
  private readonly controller = new TransferController()

  constructor(
    log: LogHandler,
    onStatus: StatusHandler,
    onScan: ScanHandler,
    onTransfer: TransferHandler
  ) {
    this.log = log
    this.onStatus = onStatus
    this.onScan = onScan
    this.onTransfer = onTransfer
  }

  isRunning(): boolean {
    return this.activeTransfer
  }

  async testConnection(config: AppConfig): Promise<ConnectionSummary> {
    await this.ensureConnected(config, true)
    return this.summary(config)
  }

  async browseRemote(config: AppConfig, path?: string): Promise<BrowseResult> {
    if (this.activeTransfer) throw new Error('任务运行中，暂时不能重新连接远端浏览器。')
    await this.ensureConnected(config)
    const remotePath = normalizeRemote(path || config.remoteRoot)
    const entries = await this.listDirectory(remotePath)
    return {
      connection: this.summary(config),
      path: remotePath,
      entries: sortEntries(entries)
    }
  }

  async browseLocal(path: string): Promise<LocalBrowseResult> {
    const target = resolve(path || '.')
    const directoryEntries = await import('node:fs/promises').then(({ readdir }) =>
      readdir(target, { withFileTypes: true })
    )
    const entries: LocalEntry[] = []

    for (const entry of directoryEntries) {
      const entryPath = join(target, entry.name)
      try {
        const info = await stat(entryPath)
        entries.push({
          name: entry.name,
          path: entryPath,
          isDirectory: info.isDirectory(),
          isSymbolicLink: entry.isSymbolicLink(),
          size: info.isDirectory() ? 0 : info.size,
          modifiedAt: info.mtime.toISOString()
        })
      } catch {
        // 无权限或已失效的条目不阻塞整个目录浏览。
      }
    }

    const parent = dirname(target)
    return {
      path: target,
      parent: parent === target ? null : parent,
      entries: sortEntries(entries)
    }
  }

  async startTransfer(
    mode: Extract<OperationMode, 'download' | 'upload'>,
    config: AppConfig,
    localRoot: string
  ): Promise<TransferResult> {
    if (this.isRunning()) throw new Error('已有任务正在运行。')
    this.controller.reset()
    this.disconnect()
    this.activeTransfer = true

    const startedAt = Date.now()
    const status: OperationStatus = mode === 'download' ? 'scanning-remote' : 'scanning-local'
    this.onStatus(status)
    let transferClient: Client | null = null

    try {
      transferClient = await this.connect(config, this.controller)
      this.controller.attach(transferClient)
      this.client = transferClient
      this.connectedAt = new Date().toISOString()
      this.configFingerprint = this.fingerprint(config)

      const localEntries =
        mode === 'upload'
          ? await this.scanLocal(
              config,
              localRoot,
              this.controller,
              (progress) => this.onScan({ ...progress, mode })
            )
          : new Map<string, LocalEntry>()

      this.onStatus('scanning-remote')
      const remoteEntries = await this.scanRemote(
        transferClient,
        config,
        config.remoteRoot,
        this.controller,
        (progress) => this.onScan({ ...progress, mode })
      )

      this.onStatus('preparing')
      const tasks =
        mode === 'download'
          ? await this.buildDownloadTasks(config, localRoot, remoteEntries.entries)
          : await this.buildUploadTasks(config, localEntries, remoteEntries.entries)

      const totalBytes = tasks.reduce((sum, task) => sum + task.size, 0)
      const skipped = Math.max(
        0,
        (mode === 'download' ? remoteEntries.files : localEntries.size) - tasks.length
      )
      this.log('info', `计划 ${tasks.length} 个文件，共 ${totalBytes} 字节，跳过 ${skipped} 个未变化文件。`)

      if (tasks.length === 0) {
        const result: TransferResult = {
          mode,
          files: 0,
          completed: 0,
          skipped,
          failures: [],
          localRoot,
          elapsedMs: Date.now() - startedAt
        }
        this.onStatus('completed')
        this.log('success', '没有需要传输的文件，目标目录已经是最新状态。')
        return result
      }

      this.onStatus('transferring')
      const tracker = new ProgressTracker(totalBytes)
      let bytesDone = 0
      let completed = 0
      const failures: TransferResult['failures'] = []
      const startedAtText = new Date().toISOString()

      for (let index = 0; index < tasks.length; index += 1) {
        this.controller.throwIfCancelled()
        await this.controller.waitIfPaused()
        const task = tasks[index]
        const fileOffset = await this.resumeOffset(mode, task)
        let fileDone = fileOffset
        const emit = (force = false): void => {
          if (!tracker.shouldEmit(force)) return
          const snapshot = tracker.snapshot(bytesDone + fileDone)
          this.onTransfer({
            mode,
            status: this.controller.paused ? 'paused' : 'transferring',
            currentFile: task.relative,
            currentRemotePath: mode === 'download' ? task.source : task.target,
            currentLocalPath: mode === 'download' ? task.target : task.source,
            fileIndex: index + 1,
            totalFiles: tasks.length,
            currentFileBytes: fileDone,
            currentFileTotal: task.size,
            completed,
            skipped,
            failed: failures.length,
            startedAt: startedAtText,
            ...snapshot
          })
        }

        this.log('info', `${mode === 'download' ? '下载' : '上传'} ${task.relative}`)
        try {
          transferClient = await this.withRetry(
            transferClient,
            config,
            this.controller,
            task.relative,
            async (activeClient) => {
              await this.transferOne(
                mode,
                activeClient,
                task,
                this.controller,
                (amount) => {
                  fileDone += amount
                  emit()
                }
              )
              fileDone = task.size
            }
          )
          this.client = transferClient
          bytesDone += task.size
          completed += 1
          emit(true)
        } catch (error) {
          if (error instanceof TransferCancelled) throw error
          const message = error instanceof Error ? error.message : String(error)
          failures.push({ relative: task.relative, message })
          bytesDone += task.size
          this.log('error', `${task.relative}：${message}`)
          emit(true)
        }
      }

      const result: TransferResult = {
        mode,
        files: tasks.length,
        completed,
        skipped,
        failures,
        localRoot,
        elapsedMs: Date.now() - startedAt
      }
      this.onStatus(failures.length > 0 ? 'error' : 'completed')
      this.log(
        failures.length > 0 ? 'warning' : 'success',
        `任务完成：成功 ${completed} 个，跳过 ${skipped} 个，失败 ${failures.length} 个。`
      )
      return result
    } catch (error) {
      if (error instanceof TransferCancelled || this.controller.cancelled) {
        this.onStatus('cancelled')
        this.log('warning', '任务已取消。')
      } else {
        this.onStatus('error')
        this.log('error', error instanceof Error ? error.message : String(error))
      }
      throw error
    } finally {
      transferClient?.close()
      this.controller.attach(null)
      this.client = null
      this.connectedAt = ''
      this.configFingerprint = ''
      this.activeTransfer = false
    }
  }

  cancelTransfer(): void {
    this.controller.cancel()
  }

  pauseTransfer(): void {
    this.controller.pause()
    this.onStatus('paused')
  }

  resumeTransfer(): void {
    this.controller.resume()
    this.onStatus('transferring')
  }

  disconnect(): void {
    this.client?.close()
    this.client = null
    this.connectedAt = ''
    this.configFingerprint = ''
  }

  private summary(config: AppConfig): ConnectionSummary {
    return {
      host: config.host,
      port: config.port,
      username: config.username,
      remoteRoot: normalizeRemote(config.remoteRoot),
      secure: config.tls,
      connectedAt: this.connectedAt || new Date().toISOString()
    }
  }

  private fingerprint(config: AppConfig): string {
    return JSON.stringify({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      tls: config.tls,
      passive: config.passive,
      timeout: config.timeout
    })
  }

  private async ensureConnected(config: AppConfig, force = false): Promise<Client> {
    if (!config.host.trim()) throw new Error('请先填写 FTP 主机。')
    if (!config.username.trim()) throw new Error('请先填写 FTP 用户名。')
    if (force || !this.client || this.configFingerprint !== this.fingerprint(config)) {
      this.disconnect()
      this.client = await this.connect(config, null)
      this.configFingerprint = this.fingerprint(config)
      this.connectedAt = new Date().toISOString()
      this.log('success', `已连接 ${config.host}:${config.port}`)
    }
    return this.client
  }

  private async connect(config: AppConfig, controller: TransferController | null): Promise<Client> {
    const client = new Client(Math.max(10, config.timeout) * 1000, {
      allowSeparateTransferHost: true
    })
    client.ftp.verbose = false
    controller?.attach(client)
    this.onStatus('connecting')
    this.log('info', `正在连接 ${config.host}:${config.port}...`)
    await client.access({
      host: config.host.trim(),
      port: config.port,
      user: config.username.trim(),
      password: config.password,
      secure: config.tls,
      secureOptions: {
        rejectUnauthorized: true
      }
    })
    this.log('success', `FTP 连接成功，远端根目录 ${normalizeRemote(config.remoteRoot)}。`)
    return client
  }

  private async listDirectory(path: string): Promise<RemoteEntry[]> {
    if (!this.client) throw new Error('FTP 尚未连接。')
    const remotePath = normalizeRemote(path)
    const entries = await this.client.list(remotePath)
    return entries
      .filter((entry) => entry.name !== '.' && entry.name !== '..')
      .map((entry) => toRemoteEntry(remotePath, entry))
  }

  private async scanRemote(
    client: Client,
    config: AppConfig,
    root: string,
    controller: TransferController,
    progress: ScanHandler
  ): Promise<ScanResult> {
    const startedAt = Date.now()
    const found = new Map<string, RemoteEntry>()
    const queue: string[] = ['']
    let directories = 0
    let files = 0
    let bytes = 0
    let lastEmitAt = 0

    while (queue.length > 0) {
      controller.throwIfCancelled()
      await controller.waitIfPaused()
      const relativeDirectory = queue.shift() ?? ''
      const remoteDirectory = joinRemote(root, relativeDirectory)
      const entries = await client.list(remoteDirectory)
      directories += 1

      for (const info of entries) {
        if (info.name === '.' || info.name === '..') continue
        const relativePath = [relativeDirectory, info.name].filter(Boolean).join('/')
        if (shouldExclude(relativePath, config.excludePatterns)) continue
        const entry = toRemoteEntry(remoteDirectory, info)
        found.set(relativePath, entry)
        if (entry.isDirectory) {
          queue.push(relativePath)
        } else {
          files += 1
          bytes += entry.size
        }
      }

      const now = Date.now()
      if (now - lastEmitAt >= 80) {
        progress({
          mode: 'download',
          directories,
          files,
          bytes,
          currentPath: remoteDirectory,
          elapsedMs: now - startedAt,
          phase: 'remote'
        })
        lastEmitAt = now
      }
    }

    progress({
      mode: 'download',
      directories,
      files,
      bytes,
      currentPath: normalizeRemote(root),
      elapsedMs: Date.now() - startedAt,
      phase: 'remote'
    })
    this.log('success', `远端扫描完成：${directories} 个目录，${files} 个文件。`)
    return { entries: found, directories, files, bytes }
  }

  private async scanLocal(
    config: AppConfig,
    root: string,
    controller: TransferController,
    progress: ScanHandler
  ): Promise<Map<string, LocalEntry>> {
    const startedAt = Date.now()
    const found = new Map<string, LocalEntry>()
    const queue: string[] = ['']
    let directories = 0
    let files = 0
    let bytes = 0
    let lastEmitAt = 0
    const resolvedRoot = resolve(root)

    while (queue.length > 0) {
      controller.throwIfCancelled()
      await controller.waitIfPaused()
      const relativeDirectory = queue.shift() ?? ''
      const currentPath = join(resolvedRoot, relativeDirectory)
      const { readdir } = await import('node:fs/promises')
      const entries = await readdir(currentPath, { withFileTypes: true })
      directories += 1

      for (const entry of entries) {
        const relativePath = [relativeDirectory, entry.name].filter(Boolean).join('/')
        if (shouldExclude(relativePath, config.excludePatterns)) continue
        const absolutePath = join(currentPath, entry.name)
        if (entry.isDirectory()) {
          queue.push(relativePath)
          continue
        }
        if (!entry.isFile()) continue
        try {
          const info = await stat(absolutePath)
          const localEntry: LocalEntry = {
            name: entry.name,
            path: absolutePath,
            isDirectory: false,
            isSymbolicLink: entry.isSymbolicLink(),
            size: info.size,
            modifiedAt: info.mtime.toISOString()
          }
          found.set(relativePath, localEntry)
          files += 1
          bytes += info.size
        } catch {
          this.log('warning', `无法读取本地文件：${absolutePath}`)
        }
      }

      const now = Date.now()
      if (now - lastEmitAt >= 80) {
        progress({
          mode: 'upload',
          directories,
          files,
          bytes,
          currentPath,
          elapsedMs: now - startedAt,
          phase: 'local'
        })
        lastEmitAt = now
      }
    }

    progress({
      mode: 'upload',
      directories,
      files,
      bytes,
      currentPath: resolvedRoot,
      elapsedMs: Date.now() - startedAt,
      phase: 'local'
    })
    this.log('success', `本地扫描完成：${directories} 个目录，${files} 个文件。`)
    return found
  }

  private async buildDownloadTasks(
    config: AppConfig,
    localRoot: string,
    remoteEntries: Map<string, RemoteEntry>
  ): Promise<TransferTask[]> {
    const tasks: TransferTask[] = []
    for (const [relativePath, entry] of [...remoteEntries.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      if (entry.isDirectory) continue
      const localPath = join(localRoot, ...relativePath.split('/'))
      const localInfo = await stat(localPath).catch(() => null)
      if (
        localInfo?.isFile() &&
        localInfo.size === entry.size &&
        (!config.compareMtime || isSameMtime(localInfo.mtime.getTime(), entry.modifiedAt ? new Date(entry.modifiedAt) : undefined))
      ) {
        continue
      }
      tasks.push({
        relative: relativePath,
        source: entry.path,
        target: localPath,
        size: entry.size,
        modifiedAt: entry.modifiedAt ? new Date(entry.modifiedAt) : undefined
      })
    }
    return tasks
  }

  private async buildUploadTasks(
    config: AppConfig,
    localEntries: Map<string, LocalEntry>,
    remoteEntries: Map<string, RemoteEntry>
  ): Promise<TransferTask[]> {
    const tasks: TransferTask[] = []
    for (const [relativePath, entry] of [...localEntries.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      const remoteEntry = remoteEntries.get(relativePath)
      if (
        remoteEntry &&
        !remoteEntry.isDirectory &&
        remoteEntry.size === entry.size &&
        (!config.compareMtime ||
          isSameMtime(
            entry.modifiedAt ? new Date(entry.modifiedAt).getTime() : Date.now(),
            remoteEntry.modifiedAt ? new Date(remoteEntry.modifiedAt) : undefined
          ))
      ) {
        continue
      }
      tasks.push({
        relative: relativePath,
        source: entry.path,
        target: joinRemote(config.remoteRoot, relativePath),
        size: entry.size,
        modifiedAt: entry.modifiedAt ? new Date(entry.modifiedAt) : undefined
      })
    }
    return tasks
  }

  private async resumeOffset(
    mode: Extract<OperationMode, 'download' | 'upload'>,
    task: TransferTask
  ): Promise<number> {
    if (mode === 'download') {
      const partPath = `${task.target}.part`
      const partSize = await fileSize(partPath)
      return partSize > 0 && partSize < task.size ? partSize : 0
    }
    if (!this.client) return 0
    const remoteSize = await this.client.size(task.target).catch(() => 0)
    return remoteSize > 0 && remoteSize < task.size ? remoteSize : 0
  }

  private async transferOne(
    mode: Extract<OperationMode, 'download' | 'upload'>,
    client: Client,
    task: TransferTask,
    controller: TransferController,
    onBytes: (amount: number) => void
  ): Promise<void> {
    if (mode === 'download') {
      await mkdir(dirname(task.target), { recursive: true })
      const partPath = `${task.target}.part`
      const offset = await fileSize(partPath)
      const safeOffset = offset > task.size ? 0 : offset
      if (safeOffset > 0 && safeOffset >= task.size) {
        await rename(partPath, task.target)
        await setLocalMtime(task.target, task.modifiedAt)
        return
      }
      if (safeOffset > 0) {
        const partInfo = await stat(partPath).catch(() => null)
        if (!partInfo || partInfo.size !== safeOffset) await unlink(partPath).catch(() => undefined)
      }
      const sink = new CountingWritable(partPath, controller, onBytes)
      await client.downloadTo(sink, task.source, safeOffset)
      const actual = await fileSize(partPath)
      if (actual !== task.size) {
        throw new Error(`下载大小不一致，期望 ${task.size}，实际 ${actual}。`)
      }
      await rename(partPath, task.target)
      await setLocalMtime(task.target, task.modifiedAt)
      return
    }

    const remoteDirectory = posix.dirname(task.target)
    if (remoteDirectory && remoteDirectory !== '/') await client.ensureDir(remoteDirectory)
    const remoteSize = await client.size(task.target).catch(() => 0)
    const offset = remoteSize > 0 && remoteSize < task.size ? remoteSize : 0
    if (offset > 0) await client.send(`REST ${offset}`)
    const uploadSource = createReadStream(task.source, { start: offset, highWaterMark: BLOCK_SIZE })
    const uploadCounter = new CountingTransform(controller, onBytes)
    uploadSource.pipe(uploadCounter)
    await client.uploadFrom(uploadCounter, task.target)
    const actual = await client.size(task.target).catch(() => null)
    if (actual !== null && actual !== task.size) {
      throw new Error(`上传大小不一致，期望 ${task.size}，实际 ${actual}。`)
    }
    return
  }

  private async withRetry(
    client: Client,
    config: AppConfig,
    controller: TransferController,
    label: string,
    action: (activeClient: Client) => Promise<void>
  ): Promise<Client> {
    let activeClient = client
    for (let attempt = 0; attempt <= config.retries; attempt += 1) {
      try {
        await action(activeClient)
        return activeClient
      } catch (error) {
        if (error instanceof TransferCancelled || controller.cancelled) throw error
        if (attempt >= config.retries) throw error
        const waitSeconds = Math.min(15, 2 ** attempt)
        this.log('warning', `${label} 第 ${attempt + 1} 次失败，${waitSeconds} 秒后重试。`)
        activeClient.close()
        await new Promise((resolvePromise) => setTimeout(resolvePromise, waitSeconds * 1000))
        activeClient = await this.connect(config, controller)
      }
    }
    return activeClient
  }
}
