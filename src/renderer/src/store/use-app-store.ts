import { create } from 'zustand'
import type {
  AppConfig,
  ConnectionSummary,
  LogEntry,
  OperationStatus,
  ScanProgress,
  TransferProgress
} from '../../../shared/types'

export type AppView = 'backup' | 'upload' | 'remote' | 'settings'

interface AppState {
  view: AppView
  config: AppConfig
  savedConfig: AppConfig
  status: OperationStatus
  connection: ConnectionSummary | null
  scanProgress: ScanProgress | null
  transferProgress: TransferProgress | null
  logs: LogEntry[]
  busy: boolean
  ready: boolean
  setView: (view: AppView) => void
  setConfig: (config: AppConfig) => void
  patchConfig: (patch: Partial<AppConfig>) => void
  markSaved: (config: AppConfig) => void
  setStatus: (status: OperationStatus) => void
  setConnection: (connection: ConnectionSummary | null) => void
  setScanProgress: (progress: ScanProgress | null) => void
  setTransferProgress: (progress: TransferProgress | null) => void
  appendLog: (entry: LogEntry) => void
  clearLogs: () => void
  setBusy: (busy: boolean) => void
  setReady: (ready: boolean) => void
}

const emptyConfig: AppConfig = {
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
  excludePatterns: []
}

export const useAppStore = create<AppState>((set) => ({
  view: 'backup',
  config: emptyConfig,
  savedConfig: emptyConfig,
  status: 'idle',
  connection: null,
  scanProgress: null,
  transferProgress: null,
  logs: [],
  busy: false,
  ready: false,
  setView: (view) => set({ view }),
  setConfig: (config) => set({ config }),
  patchConfig: (patch) => set((state) => ({ config: { ...state.config, ...patch } })),
  markSaved: (config) => set({ config, savedConfig: config }),
  setStatus: (status) => set({ status }),
  setConnection: (connection) => set({ connection }),
  setScanProgress: (scanProgress) => set({ scanProgress }),
  setTransferProgress: (transferProgress) => set({ transferProgress }),
  appendLog: (entry) =>
    set((state) => ({
      logs: [...state.logs.slice(-799), entry]
    })),
  clearLogs: () => set({ logs: [] }),
  setBusy: (busy) => set({ busy }),
  setReady: (ready) => set({ ready })
}))
