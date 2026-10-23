import { contextBridge, ipcRenderer } from 'electron'
import type { AppApi } from '../shared/types'

const api: AppApi = {
  loadConfig: () => ipcRenderer.invoke('grace:config:load'),
  saveConfig: (config) => ipcRenderer.invoke('grace:config:save', config),
  chooseLocalDirectory: (defaultPath) =>
    ipcRenderer.invoke('grace:choose-directory', defaultPath),
  testConnection: (config) => ipcRenderer.invoke('grace:test-connection', config),
  browseRemote: (request) => ipcRenderer.invoke('grace:browse-remote', request),
  browseLocal: (path) => ipcRenderer.invoke('grace:browse-local', path),
  startTransfer: (request) => ipcRenderer.invoke('grace:transfer:start', request),
  cancelTransfer: () => ipcRenderer.invoke('grace:transfer:cancel'),
  pauseTransfer: () => ipcRenderer.invoke('grace:transfer:pause'),
  resumeTransfer: () => ipcRenderer.invoke('grace:transfer:resume'),
  openPath: (path) => ipcRenderer.invoke('grace:open-path', path),
  revealPath: (path) => ipcRenderer.invoke('grace:reveal-path', path),
  onLog: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]): void =>
      callback(payload)
    ipcRenderer.on('grace:log', listener)
    return () => ipcRenderer.removeListener('grace:log', listener)
  },
  onStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]): void =>
      callback(payload)
    ipcRenderer.on('grace:status', listener)
    return () => ipcRenderer.removeListener('grace:status', listener)
  },
  onScanProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]): void =>
      callback(payload)
    ipcRenderer.on('grace:scan-progress', listener)
    return () => ipcRenderer.removeListener('grace:scan-progress', listener)
  },
  onTransferProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]): void =>
      callback(payload)
    ipcRenderer.on('grace:transfer-progress', listener)
    return () => ipcRenderer.removeListener('grace:transfer-progress', listener)
  }
}

contextBridge.exposeInMainWorld('grace', api)
