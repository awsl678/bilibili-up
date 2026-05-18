"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => electron.ipcRenderer.invoke("window-minimize"),
  maximize: () => electron.ipcRenderer.invoke("window-maximize"),
  close: () => electron.ipcRenderer.invoke("window-close"),
  isMaximized: () => electron.ipcRenderer.invoke("window-is-maximized"),
  onWindowStateChange: (callback) => {
    electron.ipcRenderer.on("window-state-changed", (_event, isMaximized) => callback(isMaximized));
  },
  request: (url, options) => electron.ipcRenderer.invoke("http-request", { url, ...options }),
  loginGetQr: () => electron.ipcRenderer.invoke("login-get-qr"),
  loginCheckStatus: () => electron.ipcRenderer.invoke("login-check-status"),
  logout: () => electron.ipcRenderer.invoke("logout"),
  isLoggedIn: () => electron.ipcRenderer.invoke("is-logged-in"),
  // 数据库
  dbMarkUp: (upData) => electron.ipcRenderer.invoke("db-mark-up", upData),
  dbUnmarkUp: (mid) => electron.ipcRenderer.invoke("db-unmark-up", mid),
  dbGetMarkedUps: () => electron.ipcRenderer.invoke("db-get-marked-ups"),
  dbFetchUpDynamics: (mid) => electron.ipcRenderer.invoke("fetch-up-dynamics", mid),
  dbGetUpDynamics: (mid, limit) => electron.ipcRenderer.invoke("db-get-up-dynamics", mid, limit),
  wbiSignParams: (params) => electron.ipcRenderer.invoke("wbi-sign-params", params),
  dbAddDynamics: (dynamics) => electron.ipcRenderer.invoke("db-add-dynamics", dynamics)
});
