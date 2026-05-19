import React, { useState, useEffect, useCallback, useMemo } from 'react'

interface UpWithStat {
  mid: number; name: string; face: string; marked_time: string
  last_update_time: number; dyn_count: number; last_dyn_ts: number
}

interface VideoItem {
  bvid: string; title: string; cover: string; play_count: number
  danmaku_count: number; duration_text: string; pub_ts: number; play_delta: number | null
}

const DAY = 86400

function fmtCount(n: number): string {
  if (n == null) return '--'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return String(n)
}

function deltaStr(d: number | null): string {
  if (d == null) return ''
  if (d === 0) return '±0'
  return d > 0 ? `+${fmtCount(d)}` : `-${fmtCount(Math.abs(d))}`
}

function timeAgo(ts: number): string {
  if (!ts) return '未更新'
  const diff = Math.floor((Date.now() / 1000) - ts)
  if (diff < 3600) return '刚刚'
  if (diff < DAY) return Math.floor(diff / 3600) + '小时前'
  if (diff < 2 * DAY) return '1天前'
  if (diff < 30 * DAY) return Math.floor(diff / DAY) + '天前'
  return Math.floor(diff / (30 * DAY)) + '月前'
}

function tsToDate(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const DATE_FILTERS = [
  { label: '全部', getRange: () => null as { start: number; end: number } | null },
  { label: '今天', getRange: () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return { start: Math.floor(start.getTime() / 1000), end: Math.floor(Date.now() / 1000) + 1 }
  }},
  { label: '昨天', getRange: () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return { start: Math.floor(start.getTime() / 1000), end: Math.floor(end.getTime() / 1000) }
  }},
  { label: '近3天', getRange: () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2)
    return { start: Math.floor(start.getTime() / 1000), end: Math.floor(Date.now() / 1000) + 1 }
  }},
  { label: '近7天', getRange: () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
    return { start: Math.floor(start.getTime() / 1000), end: Math.floor(Date.now() / 1000) + 1 }
  }},
]

const MarkedUps: React.FC = () => {
  const [ups, setUps] = useState<UpWithStat[]>([])
  const [dynamics, setDynamics] = useState<any[]>([])
  const [selectedMid, setSelectedMid] = useState<number | null>(null)
  const [dateFilter, setDateFilter] = useState(0)
  const [sortAsc, setSortAsc] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [showVideos, setShowVideos] = useState<Record<number, VideoItem[]>>({})

  useEffect(() => {
    window.electronAPI?.isLoggedIn().then(setIsLoggedIn)
  }, [])

  const loadUps = useCallback(async () => {
    try {
      const res = await window.electronAPI!.getMarkedUpsWithStats()
      setUps(Array.isArray(res) ? res : [])
    } catch { setUps([]) }
  }, [])

  const loadAllDynamics = useCallback(async () => {
    setLoading(true)
    try {
      // 从数据库加载所有已收藏 UP 主的动态
      const allMids = ups.map(u => u.mid)
      if (allMids.length === 0) { setDynamics([]); return }

      const range = DATE_FILTERS[dateFilter].getRange()
      let rows: any[]
      if (range) {
        rows = await window.electronAPI!.getDynamicsByDate(allMids, range.start, range.end)
      } else {
        // 取最近200条
        const startTs = 0
        const endTs = Math.floor(Date.now() / 1000) + DAY
        rows = await window.electronAPI!.getDynamicsByDate(allMids, startTs, endTs)
      }

      if (Array.isArray(rows)) {
        // 如果选中了特定 UP 主就只显示他的
        const filtered = selectedMid ? rows.filter((d: any) => d.mid === selectedMid) : rows
        setDynamics(filtered.slice(0, 200))
      } else {
        setDynamics([])
      }
    } catch { setDynamics([]) }
    finally { setLoading(false) }
  }, [ups, selectedMid, dateFilter])

  const refreshAll = useCallback(async () => {
    if (!isLoggedIn) { alert('请先登录'); return }
    setLoading(true)
    try {
      const res = await window.electronAPI!.fetchAllMarkedDynamics()
      if (res.success) {
        await loadUps()
        await loadAllDynamics()
      } else {
        alert(`拉取完成，部分失败：${res.errors?.join(', ') || ''}`)
      }
    } catch (err: any) {
      alert('请求异常：' + err.message)
    } finally { setLoading(false) }
  }, [isLoggedIn, loadUps, loadAllDynamics])

  const refreshSingle = useCallback(async (mid: number) => {
    if (!isLoggedIn) { alert('请先登录'); return }
    setLoading(true)
    try {
      await window.electronAPI!.dbFetchUpDynamics(mid)
      await loadUps()
      await loadAllDynamics()
    } catch (err: any) {
      alert('请求异常：' + err.message)
    } finally { setLoading(false) }
  }, [isLoggedIn, loadUps, loadAllDynamics])

  const loadVideos = useCallback(async (mid: number) => {
    if (showVideos[mid]) return
    try {
      const vids = await window.electronAPI!.getUpVideos(mid)
      setShowVideos(prev => ({ ...prev, [mid]: Array.isArray(vids) ? vids : [] }))
    } catch {}
  }, [showVideos])

  useEffect(() => { loadUps() }, [loadUps])
  useEffect(() => {
    if (ups.length > 0) loadAllDynamics()
  }, [ups.length, selectedMid, dateFilter, loadAllDynamics])

  const sortedUps = useMemo(() => {
    const s = [...ups]
    s.sort((a, b) => {
      const diff = (b.last_dyn_ts || 0) - (a.last_dyn_ts || 0)
      return sortAsc ? -diff : diff
    })
    return s
  }, [ups, sortAsc])

  const renderDynamicCard = (d: any) => {
    let parsed: any = { text: '' }
    try { parsed = JSON.parse(d.content) } catch {}

    const up = ups.find(u => u.mid === d.mid)
    const upName = up?.name || `UP${d.mid}`
    const upFace = up?.face || ''

    return (
      <div key={d.id} className="dyn-card" style={{
        padding: '12px 16px', borderBottom: '1px solid #eee', display: 'flex', gap: 12,
        cursor: d.type === 'archive' && parsed.bvid ? 'pointer' : 'default',
      }}
        onClick={() => { if (parsed.bvid) window.open(`https://www.bilibili.com/video/${parsed.bvid}`) }}
      >
        {/* UP 主头像 */}
        <img src={upFace} style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: '#eee' }}
          onClick={(e) => { e.stopPropagation(); setSelectedMid(d.mid) }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 头部：UP 主名 + 类型标签 + 时间 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: '#333', cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); setSelectedMid(d.mid) }}
            >{upName}</span>
            <TypeBadge type={d.type} />
            {d.pub_action && <span style={{ fontSize: 11, color: '#999' }}>{d.pub_action}</span>}
            <span style={{ fontSize: 11, color: '#bbb', marginLeft: 'auto' }}>{timeAgo(d.timestamp)}</span>
          </div>

          {/* 内容 */}
          {d.type === 'archive' && <ArchiveCard parsed={parsed} mid={d.mid} loadVideos={loadVideos} showVideos={showVideos} />}
          {d.type === 'draw' && <DrawCard parsed={parsed} />}
          {d.type === 'article' && <ArticleCard parsed={parsed} />}
          {d.type === 'opus' && <OpusCard parsed={parsed} />}
          {(d.type === 'text' || d.type === 'music' || d.type === 'live' || d.type === 'pgc' || d.type === 'courses') && <TextCard parsed={parsed} type={d.type} />}
        </div>
      </div>
    )
  }

  const handleUnmark = async (mid: number) => {
    await window.electronAPI!.dbUnmarkUp(mid)
    if (selectedMid === mid) setSelectedMid(null)
    loadUps()
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 顶部操作栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 0 12px 0', flexShrink: 0 }}>
        <h2 style={{ fontSize: 18, margin: 0, marginRight: 'auto' }}>收藏管理</h2>
        <div style={{ display: 'flex', gap: 4 }}>
          {DATE_FILTERS.map((f, i) => (
            <button key={i} onClick={() => setDateFilter(i)}
              style={{
                padding: '3px 10px', borderRadius: 14, border: dateFilter === i ? '1px solid #fb7299' : '1px solid #ddd',
                background: dateFilter === i ? '#fce4ec' : '#fff', color: dateFilter === i ? '#fb7299' : '#666',
                fontSize: 12, cursor: 'pointer',
              }}
            >{f.label}</button>
          ))}
        </div>
        <button onClick={() => setSortAsc(!sortAsc)}
          style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid #ddd', background: '#fff', fontSize: 12, cursor: 'pointer' }}
        >{sortAsc ? '↑ 从远到近' : '↓ 从近到远'}</button>
        <button onClick={refreshAll} disabled={loading || !isLoggedIn}
          style={{
            padding: '6px 16px', borderRadius: 6, border: 'none', background: '#fb7299', color: '#fff',
            fontSize: 13, cursor: isLoggedIn ? 'pointer' : 'not-allowed', opacity: loading ? 0.6 : 1,
          }}
        >{loading ? '刷新中...' : '刷新全部'}</button>
      </div>

      {/* 主体：左右两栏 */}
      <div style={{ flex: 1, display: 'flex', gap: 16, overflow: 'hidden' }}>
        {/* 左栏：UP 主列表 */}
        <div style={{ width: 260, flexShrink: 0, overflowY: 'auto', paddingRight: 8 }}>
          <div
            onClick={() => setSelectedMid(null)}
            style={{
              padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
              background: selectedMid === null ? '#fce4ec' : '#fff',
              border: selectedMid === null ? '1px solid #fb7299' : '1px solid transparent',
              fontWeight: selectedMid === null ? 600 : 400, fontSize: 14,
            }}
          >全部动态</div>
          {sortedUps.map(up => (
            <div key={up.mid}
              onClick={() => { setSelectedMid(up.mid); loadVideos(up.mid) }}
              style={{
                padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                background: selectedMid === up.mid ? '#fce4ec' : '#fff',
                border: selectedMid === up.mid ? '1px solid #fb7299' : '1px solid transparent',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <img src={up.face} style={{ width: 32, height: 32, borderRadius: '50%', background: '#eee', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{up.name}</div>
                <div style={{ fontSize: 11, color: '#999' }}>
                  {timeAgo(up.last_dyn_ts)}
                  {up.dyn_count > 0 && <span> · {up.dyn_count}条</span>}
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); handleUnmark(up.mid) }}
                style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
                title="取消收藏"
              >×</button>
            </div>
          ))}
          {sortedUps.length === 0 && <div style={{ color: '#999', fontSize: 13, padding: 16 }}>还没有收藏任何 UP 主</div>}
        </div>

        {/* 右栏：动态流 */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {!isLoggedIn && <div style={{ color: '#e67e22', fontSize: 13, padding: '8px 0' }}>请先登录，才能拉取最新动态</div>}

          {selectedMid && (
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => refreshSingle(selectedMid)} disabled={loading || !isLoggedIn}
                style={{
                  padding: '4px 14px', borderRadius: 4, border: '1px solid #fb7299', background: '#fff',
                  color: '#fb7299', fontSize: 12, cursor: 'pointer',
                }}
              >拉取该UP主最新动态</button>

              {/* 播放量变化 */}
              {showVideos[selectedMid] && showVideos[selectedMid].length >= 2 && (
                <div style={{ fontSize: 12, color: '#666' }}>
                  最新视频播放量较上一期：
                  <span style={{ color: (showVideos[selectedMid][0]?.play_delta ?? 0) >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>
                    {deltaStr(showVideos[selectedMid][0]?.play_delta)}
                  </span>
                </div>
              )}
            </div>
          )}

          {dynamics.map(renderDynamicCard)}

          {dynamics.length === 0 && !loading && (
            <div style={{ color: '#999', textAlign: 'center', padding: 40 }}>
              {ups.length === 0 ? '还没有收藏任何 UP 主' : '暂无动态，请登录后点击"刷新全部"'}
            </div>
          )}
          {loading && <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>加载中...</div>}
        </div>
      </div>
    </div>
  )
}

// ---------- 类型标签 ----------
const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  archive: { label: '视频', color: '#fb7299', bg: '#fce4ec' },
  draw: { label: '图片', color: '#1890ff', bg: '#e6f7ff' },
  article: { label: '专栏', color: '#722ed1', bg: '#f9f0ff' },
  text: { label: '文字', color: '#666', bg: '#f5f5f5' },
  opus: { label: '图文', color: '#fa8c16', bg: '#fff7e6' },
  music: { label: '音乐', color: '#13c2c2', bg: '#e6fffb' },
  live: { label: '直播', color: '#f5222d', bg: '#fff1f0' },
  pgc: { label: 'PGC', color: '#2f54eb', bg: '#f0f5ff' },
  courses: { label: '课程', color: '#2f54eb', bg: '#f0f5ff' },
}

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.text
  return <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: cfg.bg, color: cfg.color, fontWeight: 500 }}>{cfg.label}</span>
}

// ---------- 各类型卡片 ----------
function ArchiveCard({ parsed, mid, loadVideos, showVideos }: { parsed: any; mid: number; loadVideos: (mid: number) => void; showVideos: Record<number, VideoItem[]> }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {parsed.cover && (
        <img src={parsed.cover} style={{ width: 140, height: 80, borderRadius: 6, objectFit: 'cover', flexShrink: 0, background: '#eee' }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4, lineHeight: 1.4 }}>{parsed.title || parsed.text}</div>
        <div style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>
          ▶ {fmtCount(parsed.play)} · 弹幕 {fmtCount(parsed.danmaku)} · {parsed.duration || '--'}
          {parsed.badge && <span style={{ marginLeft: 8, color: '#fb7299', fontSize: 11 }}>{parsed.badge}</span>}
        </div>
        {/* 播放量变化 */}
        <PlayDelta mid={mid} loadVideos={loadVideos} showVideos={showVideos} />
      </div>
    </div>
  )
}

function PlayDelta({ mid, loadVideos, showVideos }: { mid: number; loadVideos: (mid: number) => void; showVideos: Record<number, VideoItem[]> }) {
  useEffect(() => { loadVideos(mid) }, [mid])

  const vids = showVideos[mid]
  if (!vids || vids.length < 2) return null

  const delta = vids[0]?.play_delta
  if (delta == null) return null

  return (
    <div style={{ fontSize: 11, marginTop: 2 }}>
      较上期：<span style={{ fontWeight: 600, color: delta >= 0 ? '#52c41a' : '#ff4d4f' }}>{deltaStr(delta)}</span>
    </div>
  )
}

function DrawCard({ parsed }: { parsed: any }) {
  const imgs: any[] = parsed.images || []
  return (
    <div>
      {parsed.text && <div style={{ fontSize: 13, marginBottom: 6, lineHeight: 1.5 }}>{parsed.text}</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {imgs.slice(0, 4).map((img: any, i: number) => (
          <img key={i} src={img.src} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 4, background: '#eee' }} />
        ))}
        {imgs.length > 4 && <span style={{ fontSize: 12, color: '#999', alignSelf: 'flex-end' }}>+{imgs.length - 4}张</span>}
      </div>
    </div>
  )
}

function ArticleCard({ parsed }: { parsed: any }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {parsed.cover && (
        <img src={parsed.cover} style={{ width: 100, height: 64, borderRadius: 4, objectFit: 'cover', flexShrink: 0, background: '#eee' }} />
      )}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{parsed.title || '无标题专栏'}</div>
        {parsed.summary && <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>{parsed.summary.slice(0, 80)}{parsed.summary.length > 80 ? '...' : ''}</div>}
        {parsed.view > 0 && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>阅读 {fmtCount(parsed.view)}</div>}
      </div>
    </div>
  )
}

function OpusCard({ parsed }: { parsed: any }) {
  const imgs: any[] = parsed.images || []
  return (
    <div>
      <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: imgs.length > 0 ? 6 : 0 }}>{parsed.summary || parsed.text || ''}</div>
      {imgs.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {imgs.slice(0, 3).map((img: any, i: number) => (
            <img key={i} src={img.src} style={{ maxWidth: 120, maxHeight: 80, objectFit: 'cover', borderRadius: 4, background: '#eee' }} />
          ))}
        </div>
      )}
    </div>
  )
}

function TextCard({ parsed, type }: { parsed: any; type: string }) {
  const cfg = TYPE_CONFIG[type]
  return (
    <div>
      {parsed.text ? (
        <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{parsed.text}</div>
      ) : (
        <span style={{ fontSize: 12, color: '#999' }}>[{cfg?.label || type}]</span>
      )}
      {parsed.cover && (
        <img src={parsed.cover} style={{ maxWidth: 160, maxHeight: 90, borderRadius: 4, marginTop: 6, background: '#eee' }} />
      )}
    </div>
  )
}

export default MarkedUps