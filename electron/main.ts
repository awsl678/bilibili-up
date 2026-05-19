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
  `)

  // up_master 新增字段（兼容旧库）
  try { db.run('ALTER TABLE up_master ADD COLUMN last_update_time INTEGER DEFAULT 0') } catch {}
  try { db.run('ALTER TABLE up_master ADD COLUMN dynamics_count INTEGER DEFAULT 0') } catch {}

  // 重建 up_dynamics（新结构：完整类型 + pub_action）
  db.exec('DROP TABLE IF EXISTS up_dynamics')
  db.exec(`
    CREATE TABLE up_dynamics (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      mid          INTEGER NOT NULL,
      dynamic_id   BIGINT NOT NULL UNIQUE,
      type         TEXT NOT NULL,
      content      TEXT,
      timestamp    INTEGER NOT NULL,
      pub_action   TEXT,
      fetched_time TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (mid) REFERENCES up_master(mid) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_dynamics_mid ON up_dynamics(mid);
    CREATE INDEX IF NOT EXISTS idx_dynamics_time ON up_dynamics(mid, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_dynamics_ts ON up_dynamics(timestamp);
  `)

  // 视频追踪表（播放量对比用）
  db.exec(`
    CREATE TABLE IF NOT EXISTS up_videos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      mid            INTEGER NOT NULL,
      bvid           TEXT NOT NULL UNIQUE,
      title          TEXT,
      cover          TEXT,
      play_count     INTEGER DEFAULT 0,
      danmaku_count  INTEGER DEFAULT 0,
      duration_text  TEXT,
      pub_ts         INTEGER,
      dynamic_id     BIGINT,
      FOREIGN KEY (mid) REFERENCES up_master(mid) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_videos_mid_time ON up_videos(mid, pub_ts DESC);
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
  // 匿名请求：继续使用 axios
  if (args.useAuth) {
  const cookies = await session.defaultSession.cookies.get({ url: 'https://bilibili.com' })
  const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ')
  console.log('[http-auth] 携带 Cookie 总数:', cookies.length)

  return new Promise((resolve) => {
    const request = net.request({ method: args.method || 'GET', url: args.url })
    request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0')
    request.setHeader('Referer', 'https://www.bilibili.com/')
    request.setHeader('Origin', 'https://www.bilibili.com')
    request.setHeader('Accept', 'application/json, text/plain, */*')
    request.setHeader('Accept-Language', 'zh-CN,zh;q=0.9')
    request.setHeader('sec-ch-ua', '"Chromium";v="148", "Microsoft Edge";v="148", "Not/A)Brand";v="99"')
    request.setHeader('sec-ch-ua-mobile', '?0')
    request.setHeader('sec-ch-ua-platform', '"Windows"')
    if (cookieStr) {
      request.setHeader('Cookie', cookieStr)
    }
    if (args.headers) {
      for (const [k, v] of Object.entries(args.headers)) {
        request.setHeader(k, v)
      }
    }

    request.on('response', (response) => {
      let data = ''
      response.on('data', chunk => { data += chunk })
      response.on('end', () => {
        try {
          resolve({ data: JSON.parse(data), status: response.statusCode })
        } catch {
          resolve({ data, status: response.statusCode })
        }
      })
    })
    request.on('error', (error) => resolve({ error: error.message, status: 0 }))
    request.end()
  })
}

  // 认证请求：用 net.request 自动携带 session cookies
  return new Promise((resolve) => {
    const request = net.request({
      method: args.method || 'GET',
      url: args.url,
    })
    request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
    request.setHeader('Referer', 'https://www.bilibili.com/')
    if (args.headers) {
      for (const [k, v] of Object.entries(args.headers)) {
        request.setHeader(k, v)
      }
    }

    request.on('response', (response) => {
      let data = ''
      response.on('data', chunk => { data += chunk })
      response.on('end', () => {
        try {
          resolve({ data: JSON.parse(data), status: response.statusCode })
        } catch {
          resolve({ data, status: response.statusCode })
        }
      })
    })
    request.on('error', (error) => {
      resolve({ error: error.message, status: 0 })
    })
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

// ---------- 工具：B站播放量字符串 → 数字 ----------
function parseCount(s: string | undefined): number {
  if (!s) return 0
  if (s.includes('万')) return Math.round(parseFloat(s.replace('万', '')) * 10000)
  const n = parseInt(s)
  return isNaN(n) ? 0 : n
}

// ---------- 工具：解析单条 polymer 动态 ----------
const DYNAMIC_TYPE_MAP: Record<string, string> = {
  'MAJOR_TYPE_ARCHIVE': 'archive',
  'MAJOR_TYPE_DRAW': 'draw',
  'MAJOR_TYPE_ARTICLE': 'article',
  'MAJOR_TYPE_COMMON': 'text',
  'MAJOR_TYPE_OPUS': 'opus',
  'MAJOR_TYPE_MUSIC': 'music',
  'MAJOR_TYPE_LIVE': 'live',
  'MAJOR_TYPE_PGC': 'pgc',
  'MAJOR_TYPE_COURSES': 'courses',
}

function parseDynamicItem(item: any, mid: number) {
  const mod = item.modules
  if (!mod?.module_dynamic) return null

  const dyn = mod.module_dynamic
  const major = dyn.major
  if (!major) return null

  // 直播推荐丢弃
  if (major.type === 'MAJOR_TYPE_LIVE_RCMD' || major.type === 'MAJOR_TYPE_NONE') return null

  const dynType = DYNAMIC_TYPE_MAP[major.type] || 'text'
  const descText = dyn.desc?.text || ''
  const author = mod.module_author || {}
  const timestamp = author.pub_ts || 0
  const pubAction = author.pub_action || ''

  // 按类型提取专属数据
  let content: Record<string, any> = { text: descText }

  switch (major.type) {
    case 'MAJOR_TYPE_ARCHIVE': {
      const a = major.archive
      if (!a) return null
      content = {
        text: a.desc || descText,
        title: a.title || '',
        cover: a.cover || '',
        bvid: a.bvid || '',
        play: parseCount(a.stat?.play),
        danmaku: parseInt(a.stat?.danmaku) || 0,
        duration: a.duration_text || '',
        badge: a.badge?.text || '',
        jump_url: a.jump_url || '',
      }
      break
    }
    case 'MAJOR_TYPE_DRAW': {
      const drawData = major.draw
      content = {
        text: descText,
        images: (drawData?.items || []).map((img: any) => ({
          src: img.src || '',
          width: parseInt(img.width) || 0,
          height: parseInt(img.height) || 0,
        })),
        draw_id: drawData?.id || '',
      }
      break
    }
    case 'MAJOR_TYPE_ARTICLE': {
      const art = major.article
      content = {
        text: descText,
        title: art?.title || '',
        summary: art?.summary || art?.desc || '',
        cover: art?.covers?.[0] || art?.image_urls?.[0] || '',
        url: art?.jump_url || '',
        view: parseCount(art?.stats?.view),
      }
      break
    }
    case 'MAJOR_TYPE_OPUS': {
      const opus = major.opus
      content = {
        text: opus?.title || descText,
        summary: opus?.summary?.text || '',
        images: (opus?.pics || []).map((img: any) => ({ src: img.url || img.src || '', width: parseInt(img.width) || 0, height: parseInt(img.height) || 0 })),
        jump_url: opus?.jump_url || '',
      }
      break
    }
    case 'MAJOR_TYPE_MUSIC': {
      const mus = major.music
      content = {
        text: mus?.title || descText,
        cover: mus?.cover || '',
        jump_url: mus?.jump_url || '',
      }
      break
    }
    case 'MAJOR_TYPE_LIVE': {
      const live = major.live
      content = {
        text: live?.title || descText,
        cover: live?.cover || '',
        jump_url: live?.jump_url || '',
        live_status: live?.live_status || 0,
      }
      break
    }
    case 'MAJOR_TYPE_COMMON': {
      const com = major.common
      content = {
        text: com?.desc || descText,
        jump_url: com?.jump_url || '',
      }
      break
    }
    case 'MAJOR_TYPE_PGC':
    case 'MAJOR_TYPE_COURSES': {
      const pgc = major[major.type === 'MAJOR_TYPE_PGC' ? 'pgc' : 'courses']
      content = {
        text: pgc?.title || descText,
        cover: pgc?.cover || '',
        jump_url: pgc?.jump_url || '',
      }
      break
    }
    default: {
      // 保底：取 desc 文本
      content = { text: descText }
    }
  }

  return {
    mid,
    dynamic_id: Number(item.id_str) || 0,
    type: dynType,
    content: JSON.stringify(content),
    timestamp,
    pub_action: pubAction,
  }
}

// ---------- 动态拉取 ----------
async function fetchAndStoreDynamics(mid: number): Promise<{ success: boolean; count: number; message?: string }> {
  const cookies = await session.defaultSession.cookies.get({ url: 'https://bilibili.com' })
  const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ')

  const url = `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=${mid}&platform=web&web_location=333.1387`
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://space.bilibili.com/',
    'Origin': 'https://space.bilibili.com',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  }
  if (cookieStr) headers['Cookie'] = cookieStr

  return new Promise((resolve) => {
    const req = https.get(url, { headers }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.code !== 0) {
            resolve({ success: false, count: 0, message: parsed.message || `code=${parsed.code}` })
            return
          }

          const items: any[] = parsed.data?.items || []
          const dynamics = items.map(item => parseDynamicItem(item, mid)).filter(Boolean)

          if (dynamics.length === 0) {
            resolve({ success: true, count: 0 })
            return
          }

          const insertDyn = db.prepare(
            'INSERT OR IGNORE INTO up_dynamics (mid, dynamic_id, type, content, timestamp, pub_action) VALUES (?, ?, ?, ?, ?, ?)'
          )
          const insertVid = db.prepare(
            'INSERT OR IGNORE INTO up_videos (mid, bvid, title, cover, play_count, danmaku_count, duration_text, pub_ts, dynamic_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          )

          let maxTs = 0
          for (const d of dynamics) {
            insertDyn.run([d.mid, d.dynamic_id, d.type, d.content, d.timestamp, d.pub_action])
            if (d.timestamp > maxTs) maxTs = d.timestamp

            // 视频类型同步写入 up_videos
            if (d.type === 'archive') {
              const c = JSON.parse(d.content)
              if (c.bvid) {
                insertVid.run([d.mid, c.bvid, c.title, c.cover, c.play, c.danmaku, c.duration, d.timestamp, d.dynamic_id])
              }
            }
          }
          insertDyn.free()
          insertVid.free()

          // 更新 UP 主的最后更新时间和动态数
          db.run('UPDATE up_master SET last_update_time = MAX(last_update_time, ?), dynamics_count = (SELECT COUNT(*) FROM up_dynamics WHERE mid = ?) WHERE mid = ?', [maxTs, mid, mid])
          ;(db as any).saveToFile()

          resolve({ success: true, count: dynamics.length })
        } catch (err: any) {
          resolve({ success: false, count: 0, message: err.message })
        }
      })
    })
    req.on('error', (err) => resolve({ success: false, count: 0, message: err.message }))
    req.end()
  })
}

ipcMain.handle('fetch-up-dynamics', async (_event, mid: number) => {
  return fetchAndStoreDynamics(mid)
})

// 批量拉取所有已收藏 UP 主的动态
ipcMain.handle('fetch-all-marked-dynamics', async () => {
  const stmt = db.prepare('SELECT mid FROM up_master WHERE is_active = 1')
  const mids: number[] = []
  while (stmt.step()) mids.push(stmt.getAsObject().mid)
  stmt.free()

  let total = 0
  const errors: string[] = []
  for (const mid of mids) {
    const r = await fetchAndStoreDynamics(mid)
    total += r.count
    if (!r.success) errors.push(`${mid}: ${r.message}`)
    // 节流，避免连续请求触发风控
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  return { success: errors.length === 0, total, errors }
})

// 获取已收藏 UP 主列表（含统计）
ipcMain.handle('get-marked-ups-with-stats', async () => {
  const rows: any[] = []
  const stmt = db.prepare(`
    SELECT m.*,
      (SELECT COUNT(*) FROM up_dynamics WHERE mid = m.mid) AS dyn_count,
      (SELECT COALESCE(MAX(timestamp), 0) FROM up_dynamics WHERE mid = m.mid) AS last_dyn_ts
    FROM up_master m WHERE m.is_active = 1 ORDER BY last_dyn_ts DESC
  `)
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
})

// 获取 UP 主视频列表及播放量变化
ipcMain.handle('get-up-videos', async (_event, mid: number) => {
  const stmt = db.prepare('SELECT * FROM up_videos WHERE mid = ? ORDER BY pub_ts DESC LIMIT 20')
  stmt.bind([mid])
  const rows: any[] = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()

  // 计算每条视频与上一条的播放量变化
  return rows.map((v, i) => {
    const prev = rows[i + 1] // 按时间倒序，下一条就是更早的视频
    return { ...v, play_delta: prev ? v.play_count - prev.play_count : null }
  })
})

// 按日期范围获取动态
ipcMain.handle('get-dynamics-by-date', async (_event, mids: number[], startTs: number, endTs: number) => {
  if (mids.length === 0) return []
  const placeholders = mids.map(() => '?').join(',')
  const stmt = db.prepare(
    `SELECT * FROM up_dynamics WHERE mid IN (${placeholders}) AND timestamp >= ? AND timestamp < ? ORDER BY timestamp DESC`
  )
  stmt.bind([...mids, startTs, endTs])
  const rows: any[] = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
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