import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowStateChange: (callback: (isMaximized: boolean) => void) => {
    ipcRenderer.on('window-state-changed', (_event, isMaximized) => callback(isMaximized))
  },
  request: (url: string, options?: { method?: string; headers?: Record<string, string>; useAuth?: boolean }) =>
    ipcRenderer.invoke('http-request', { url, ...options }),
  loginGetQr: () => ipcRenderer.invoke('login-get-qr'),
  loginCheckStatus: () => ipcRenderer.invoke('login-check-status'),
  logout: () => ipcRenderer.invoke('logout'),
  isLoggedIn: () => ipcRenderer.invoke('is-logged-in'),
  // 数据库
  dbMarkUp: (upData: { mid: number; name: string; face?: string }) => ipcRenderer.invoke('db-mark-up', upData),
  dbUnmarkUp: (mid: number) => ipcRenderer.invoke('db-unmark-up', mid),
  dbGetMarkedUps: () => ipcRenderer.invoke('db-get-marked-ups'),
  dbFetchUpDynamics: (mid: number) => ipcRenderer.invoke('fetch-up-dynamics', mid),
  dbGetUpDynamics: (mid: number, limit?: number) => ipcRenderer.invoke('db-get-up-dynamics', mid, limit),
  // 收藏页重构新增
  fetchAllMarkedDynamics: () => ipcRenderer.invoke('fetch-all-marked-dynamics'),
  getMarkedUpsWithStats: () => ipcRenderer.invoke('get-marked-ups-with-stats'),
  getUpVideos: (mid: number) => ipcRenderer.invoke('get-up-videos', mid),
  getDynamicsByDate: (mids: number[], startTs: number, endTs: number) =>
    ipcRenderer.invoke('get-dynamics-by-date', mids, startTs, endTs),
  getUpInfoViaPage: (mid: number) => ipcRenderer.invoke('get-up-info-via-page', mid),
})