export type OperationMode = 'download' | 'upload' | 'test' | 'browse'

export type OperationStatus =
  | 'idle'
  | 'connecting'
  | 'scanning-local'
  | 'scanning-remote'
  | 'preparing'
  | 'transferring'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'error'

export interface AppConfig {
  host: string
  port: number
  username: string
  password: string
  rememberPassword: boolean
  remoteRoot: string
  passive: boolean
  tls: boolean
  localRoot: string
  timestampFolder: boolean
  compareMtime: boolean
  retries: number
  timeout: number
  excludePatterns: string[]
}

export interface StoredConfig extends Omit<AppConfig, 'password'> {
  passwordEncrypted: string
}

export interface RemoteEntry {
  name: string
  path: string
  isDirectory: boolean
  isSymbolicLink: boolean
  size: number
  modifiedAt?: string
  rawModifiedAt?: string
}

export interface LocalEntry {
  name: string
  path: string
  isDirectory: boolean
  isSymbolicLink: boolean
  size: number
  modifiedAt?: string
}

export interface ConnectionSummary {
  host: string
  port: number
  username: string
  remoteRoot: string
  secure: boolean
  connectedAt: string
}

export interface ScanProgress {
  mode: OperationMode
  directories: number
  files: number
  bytes: number
  currentPath: string
  elapsedMs: number
  phase: 'local' | 'remote'
}

export interface TransferProgress {
  mode: Extract<OperationMode, 'download' | 'upload'>
  status: OperationStatus
  currentFile: string
  currentRemotePath: string
  currentLocalPath: string
  fileIndex: number
  totalFiles: number
  currentFileBytes: number
  currentFileTotal: number
  bytesDone: number
  bytesTotal: number
  percent: number
  speed: number
  etaSeconds: number | null
  completed: number
  skipped: number
  failed: number
  startedAt: string
}

export interface LogEntry {
  id: string
  time: string
  level: 'info' | 'success' | 'warning' | 'error'
  message: string
}

export interface TransferResult {
  mode: Extract<OperationMode, 'download' | 'upload'>
  files: number
  completed: number
  skipped: number
  failures: Array<{ relative: string; message: string }>
  localRoot: string
  elapsedMs: number
}

export interface StartTransferRequest {
  mode: Extract<OperationMode, 'download' | 'upload'>
  config: AppConfig
  localRoot: string
}

export interface BrowseRequest {
  config: AppConfig
  path?: string
}

export interface BrowseResult {
  connection: ConnectionSummary
  path: string
  entries: RemoteEntry[]
}

export interface LocalBrowseResult {
  path: string
  parent: string | null
  entries: LocalEntry[]
}

export interface AppApi {
  loadConfig: () => Promise<AppConfig>
  saveConfig: (config: AppConfig) => Promise<AppConfig>
  chooseLocalDirectory: (defaultPath?: string) => Promise<string | null>
  testConnection: (config: AppConfig) => Promise<ConnectionSummary>
  browseRemote: (request: BrowseRequest) => Promise<BrowseResult>
  browseLocal: (path: string) => Promise<LocalBrowseResult>
  startTransfer: (request: StartTransferRequest) => Promise<TransferResult>
  cancelTransfer: () => Promise<void>
  pauseTransfer: () => Promise<void>
  resumeTransfer: () => Promise<void>
  openPath: (path: string) => Promise<void>
  revealPath: (path: string) => Promise<void>
  onLog: (callback: (entry: LogEntry) => void) => () => void
  onStatus: (callback: (status: OperationStatus) => void) => () => void
  onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
  onTransferProgress: (callback: (progress: TransferProgress) => void) => () => void
}

declare global {
  interface Window {
    grace: AppApi
  }
}
