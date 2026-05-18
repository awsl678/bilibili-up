export interface IElectronAPI {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onWindowStateChange: (callback: (isMaximized: boolean) => void) => void
  request: (url: string, options?: { method?: string; headers?: Record<string, string>; useAuth?: boolean }) => Promise<any>
  loginGetQr: () => Promise<{ success: boolean; qrUrl?: string; message?: string }>
  loginCheckStatus: () => Promise<{ status: string; data?: any; message?: string }>
  logout: () => Promise<boolean>
  isLoggedIn: () => Promise<boolean>

  // 数据库相关
  dbMarkUp: (upData: { mid: number; name: string; face?: string }) => Promise<any>
  dbUnmarkUp: (mid: number) => Promise<any>
  dbGetMarkedUps: () => Promise<any[]>
  dbFetchUpDynamics: (mid: number) => Promise<any>
  dbGetUpDynamics: (mid: number, limit?: number) => Promise<any[]>
  wbiSignParams: (params: Record<string, any>) => ipcRenderer.invoke('wbi-sign-params', params),
  dbAddDynamics: (dynamics: any[]) => ipcRenderer.invoke('db-add-dynamics', dynamics),
}
declare global { interface Window { electronAPI?: IElectronAPI } }