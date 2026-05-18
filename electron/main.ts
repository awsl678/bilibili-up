import { app, BrowserWindow, shell, ipcMain, session, net } from 'electron'
import path from 'path'
import fs from 'fs'
import axios from 'axios'
import https from 'https'                    // ✅ 注意拼写
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
const isDev = !app.isPackaged
let db: SqlJsDatabase

// ---------- 数据库初始化 ----------
async function initDatabase() {
  const wasmPath = path.join(__dirname, 'sql-wasm.wasm')
  let wasmBinary: Buffer
  try {
    wasmBinary = fs.readFileSync(wasmPath)
  } catch {
    const sqlJs = require('sql.js')
    wasmBinary = sqlJs.WASM
  }
  const SQL = await initSqlJs({ wasmBinary })
  const dbPath = path.join(app.getPath('userData'), 'bili-copilot.db')

  let buffer: Buffer | undefined
  try {
    buffer = fs.readFileSync(dbPath)
  } catch {
    buffer = undefined
  }
  db = new SQL.Database(buffer)
  db.run('PRAGMA journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS up_master (
      mid        INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      face       TEXT,
      sign       TEXT,
      level      INTEGER DEFAULT 0,
      official   INTEGER DEFAULT 0,
      marked_time TEXT DEFAULT (datetime('now','localtime')),
      note       TEXT,
      is_active  INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS up_dynamics (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      mid          INTEGER NOT NULL,
      dynamic_id   BIGINT NOT NULL UNIQUE,
      type         TEXT NOT NULL,
      content      TEXT,
      timestamp    INTEGER NOT NULL,
      has_video    INTEGER DEFAULT 0,
      video_bvid   TEXT,
      fetched_time TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (mid) REFERENCES up_master(mid) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_dynamics_mid ON up_dynamics(mid);
    CREATE INDEX IF NOT EXISTS idx_dynamics_time ON up_dynamics(mid, timestamp DESC);
  `)

  ;(db as any).saveToFile = () => {
    const data = db.export()
    fs.writeFileSync(dbPath, Buffer.from(data))
  }
  console.log('数据库初始化完成:', dbPath)
}

// ---------- 窗口 ----------
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 900, minHeight: 600,
    titleBarStyle: 'hidden', frame: false, transparent: false,
    backgroundColor: '#00000000', backgroundMaterial: 'mica',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, webviewTag: true,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  ipcMain.handle('window-minimize', () => mainWindow.minimize())
  ipcMain.handle('window-maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.handle('window-close', () => mainWindow.close())
  ipcMain.handle('window-is-maximized', () => mainWindow.isMaximized())
  mainWindow.on('maximize', () => mainWindow.webContents.send('window-state-changed', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-state-changed', false))
}

// ---------- 登录 ----------
let loginKey = ''
ipcMain.handle('login-get-qr', async () => {
  try {
    const genRes = await axios.get('https://passport.bilibili.com/x/passport-login/web/qrcode/generate', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    })
    if (genRes.data.code !== 0) return { success: false, message: '获取二维码失败' }
    loginKey = genRes.data.data.qrcode_key
    return { success: true, qrUrl: genRes.data.data.url }
  } catch (err: any) { return { success: false, message: err.message } }
})

ipcMain.handle('login-check-status', async () => {
  if (!loginKey) return { status: 'no_qr' }
  try {
    const res = await axios.get('https://passport.bilibili.com/x/passport-login/web/qrcode/poll', {
      params: { qrcode_key: loginKey },
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    })
    const code = res.data.code
    if (code === 0 && res.data.data?.refresh_token) {
      const setCookieHeaders = res.headers['set-cookie']
      if (setCookieHeaders) {
        for (const cookieStr of setCookieHeaders) {
          const parts = cookieStr.split(';')[0].split('=')
          if (parts.length === 2) {
            await session.defaultSession.cookies.set({
              url: 'https://bilibili.com',
              name: parts[0],
              value: parts[1],
              domain: '.bilibili.com',
              path: '/',
              secure: true,
              httpOnly: false,
            })
          }
        }
      } else {
        const tokenInfo = res.data.data.token_info
        if (tokenInfo) {
          await session.defaultSession.cookies.set({
            url: 'https://bilibili.com', name: 'DedeUserID', value: String(tokenInfo.mid),
            domain: '.bilibili.com', path: '/', secure: true, httpOnly: false,
          })
          await session.defaultSession.cookies.set({
            url: 'https://bilibili.com', name: 'SESSDATA', value: tokenInfo.token,
            domain: '.bilibili.com', path: '/', secure: true, httpOnly: false,
          })
        }
      }
      return { status: 'success' }
    }
    if (code === 86038) return { status: 'expired' }
    if (code === 86090) return { status: 'scanned' }
    if (code === 86101) return { status: 'waiting' }
    return { status: 'unknown', message: res.data.message }
  } catch (err: any) { return { status: 'error', message: err.message } }
})

ipcMain.handle('logout', async () => {
  const cookies = await session.defaultSession.cookies.get({ url: 'https://bilibili.com' })
  for (const c of cookies) {
    await session.defaultSession.cookies.remove('https://bilibili.com', c.name)
  }
  loginKey = ''
  return true
})

ipcMain.handle('is-logged-in', async () => {
  const cookies = await session.defaultSession.cookies.get({ url: 'https://bilibili.com', name: 'SESSDATA' })
  return cookies.length > 0
})

// ---------- 通用 HTTP ----------
ipcMain.handle('http-request', async (_event, args: { url: string; method?: string; headers?: Record<string, string>; useAuth?: boolean }) => {
  if (!args.useAuth) {
    try {
      const res = await axios({ url: args.url, method: args.method || 'GET', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Referer: 'https://www.bilibili.com/', ...args.headers }, timeout: 15000 })
      return { data: res.data, status: res.status }
    } catch (error: any) { return { error: error.message, status: error.response?.status || 0 } }
  }

  return new Promise((resolve) => {
    const request = net.request({ method: args.method || 'GET', url: args.url })
    request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
    request.setHeader('Referer', 'https://www.bilibili.com/')
    if (args.headers) for (const [k, v] of Object.entries(args.headers)) request.setHeader(k, v)

    request.on('response', (response) => {
      let data = ''
      response.on('data', chunk => { data += chunk })
      response.on('end', () => {
        try { resolve({ data: JSON.parse(data), status: response.statusCode }) }
        catch { resolve({ data, status: response.statusCode }) }
      })
    })
    request.on('error', (error) => resolve({ error: error.message, status: 0 }))
    request.end()
  })
})

// ---------- 数据库操作 ----------
ipcMain.handle('db-mark-up', async (_event, upData) => {
  try {
    db.run('INSERT OR IGNORE INTO up_master (mid, name, face) VALUES (?, ?, ?)', [upData.mid, upData.name, upData.face || ''])
    db.run('UPDATE up_master SET is_active = 1 WHERE mid = ?', [upData.mid])
    ;(db as any).saveToFile()
    return { success: true }
  } catch (err: any) { return { success: false, message: err.message } }
})

ipcMain.handle('db-unmark-up', async (_event, mid) => {
  try {
    db.run('UPDATE up_master SET is_active = 0 WHERE mid = ?', [mid])
    ;(db as any).saveToFile()
    return { success: true }
  } catch (err: any) { return { success: false, message: err.message } }
})

ipcMain.handle('db-get-marked-ups', async () => {
  try {
    const stmt = db.prepare('SELECT * FROM up_master WHERE is_active = 1 ORDER BY marked_time DESC')
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  } catch { return [] }
})

ipcMain.handle('db-add-dynamics', async (_event, dynamics) => {
  try {
    const insert = db.prepare('INSERT OR IGNORE INTO up_dynamics (mid, dynamic_id, type, content, timestamp, has_video, video_bvid) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (const d of dynamics) insert.run([d.mid, d.dynamic_id, d.type, d.content, d.timestamp, d.has_video, d.video_bvid])
    insert.free()
    ;(db as any).saveToFile()
    return { success: true }
  } catch (err: any) { return { success: false, message: err.message } }
})

ipcMain.handle('db-get-up-dynamics', async (_event, mid, limit = 50) => {
  try {
    const stmt = db.prepare('SELECT * FROM up_dynamics WHERE mid = ? ORDER BY timestamp DESC LIMIT ?')
    stmt.bind([mid, limit])
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  } catch { return [] }
})

// ---------- 动态拉取（使用 polymer 接口，无需登录） ----------
ipcMain.handle('fetch-up-dynamics', async (_event, mid: number) => {
  try {
    const cookies = await session.defaultSession.cookies.get({ url: 'https://bilibili.com' })
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ')
    console.log('[fetch-up-dynamics] Cookie 长度:', cookieStr.length)

    const url = `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=${mid}&platform=web&web_location=333.1387`
    return new Promise((resolve) => {
      const req = https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://space.bilibili.com/',
          'Origin': 'https://space.bilibili.com',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'sec-ch-ua': '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'Cookie': cookieStr,
        }
      }, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            console.log('[fetch-up-dynamics] 响应 code:', parsed.code)
            if (parsed.code === 0) {
              const items = parsed.data?.items || []
              const dynamics = items.map((item: any) => {
                const mod = item.modules
                if (!mod || !mod.module_dynamic) return null
                const dyn = mod.module_dynamic
                const desc = dyn.desc?.text || ''
                const major = dyn.major
                let hasVideo = false, bvid = '', title = desc, pic = '', play = 0

                if (major?.archive) {
                  hasVideo = true
                  bvid = major.archive.bvid || ''
                  title = major.archive.title || desc
                  pic = major.archive.cover || ''
                  play = dyn.stat?.view?.count || 0
                } else if (major?.opus) {
                  const opus = major.opus
                  title = opus.title || desc
                  if (opus.pics?.length > 0) pic = opus.pics[0].url
                  play = dyn.stat?.view?.count || 0
                } else if (major?.live_rcmd) {
                  return null // 忽略直播动态
                }

                const timestamp = mod.module_author?.pub_ts || 0
                return {
                  mid,
                  dynamic_id: Number(item.id_str) || 0,
                  type: hasVideo ? 'video' : 'text',
                  content: JSON.stringify({ title, pic, play, created: timestamp }),
                  timestamp,
                  has_video: hasVideo ? 1 : 0,
                  video_bvid: bvid,
                }
              }).filter(Boolean)

              if (dynamics.length > 0) {
                const insert = db.prepare('INSERT OR IGNORE INTO up_dynamics (mid, dynamic_id, type, content, timestamp, has_video, video_bvid) VALUES (?, ?, ?, ?, ?, ?, ?)')
                for (const d of dynamics) {
                  insert.run([d.mid, d.dynamic_id, d.type, d.content, d.timestamp, d.has_video, d.video_bvid])
                }
                insert.free();
                (db as any).saveToFile()
              }
              resolve({ success: true, count: dynamics.length })
            } else {
              resolve({ success: false, message: parsed.message || `API 返回 ${parsed.code}` })
            }
          } catch (err: any) {
            console.error('[fetch-up-dynamics] 解析失败:', err)
            resolve({ success: false, message: '响应解析失败' })
          }
        })
      })
      req.on('error', (err) => resolve({ success: false, message: err.message }))
      req.end()
    })
  } catch (err: any) { return { success: false, message: err.message } }
})

// ---------- 启动 ----------
app.whenReady().then(async () => {
  await initDatabase()
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.hdslb.com/*', '*://*.bilibili.com/*'] },
    (details, callback) => {
      details.requestHeaders['Referer'] = 'https://www.bilibili.com/'
      callback({ requestHeaders: details.requestHeaders })
    }
  )
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })