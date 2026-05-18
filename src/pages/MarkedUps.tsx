import React, { useState, useEffect, useCallback } from 'react'

interface MarkedUp {
  mid: number
  name: string
  face: string
  marked_time: string
}

const MarkedUps: React.FC = () => {
  const [ups, setUps] = useState<MarkedUp[]>([])
  const [selectedMid, setSelectedMid] = useState<number | null>(null)
  const [dynamics, setDynamics] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    window.electronAPI?.isLoggedIn().then(setIsLoggedIn)
  }, [])

  const loadUps = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.electronAPI!.dbGetMarkedUps()
      if (Array.isArray(res)) setUps(res)
      else setUps([])
    } catch (err: any) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDynamics = useCallback(async (mid: number) => {
    setLoading(true)
    try {
      const dyns = await window.electronAPI!.dbGetUpDynamics(mid, 50)
      setDynamics(Array.isArray(dyns) ? dyns : [])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchDynamics = useCallback(async (mid: number) => {
    if (!isLoggedIn) {
      alert('请先登录后再拉取动态')
      return
    }
    setLoading(true)
    try {
      const result = await window.electronAPI!.dbFetchUpDynamics(mid)
      if (result.success) {
        const dyns = await window.electronAPI!.dbGetUpDynamics(mid, 50)
        setDynamics(Array.isArray(dyns) ? dyns : [])
      } else {
        alert('拉取失败：' + (result.message || '未知错误'))
      }
    } catch (err: any) {
      alert('请求异常：' + err.message)
    } finally {
      setLoading(false)
    }
  }, [isLoggedIn])

  useEffect(() => { loadUps() }, [loadUps])
  useEffect(() => {
    if (selectedMid) loadDynamics(selectedMid)
  }, [selectedMid, loadDynamics])

  const handleUnmark = async (mid: number) => {
    await window.electronAPI!.dbUnmarkUp(mid)
    loadUps()
    if (selectedMid === mid) {
      setSelectedMid(null)
      setDynamics([])
    }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>已标记 UP 主</h2>
      {!isLoggedIn && <div style={{ color: '#e67e22', marginBottom: 12 }}>请先登录，才能拉取最新动态</div>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {ups.map(up => (
          <div
            key={up.mid}
            onClick={() => setSelectedMid(up.mid)}
            style={{
              cursor: 'pointer',
              padding: '8px 12px',
              background: selectedMid === up.mid ? '#fce4ec' : '#f5f5f5',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              border: selectedMid === up.mid ? '1px solid #fb7299' : '1px solid #e0e0e0',
            }}
          >
            <img src={up.face} alt={up.name} style={{ width: 28, height: 28, borderRadius: '50%', background: '#eee' }} />
            <span style={{ fontSize: 14 }}>{up.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); handleUnmark(up.mid) }}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 12 }}
            >
              取消标记
            </button>
          </div>
        ))}
        {ups.length === 0 && <div style={{ color: '#999' }}>还没有标记任何 UP 主</div>}
      </div>

      {selectedMid && (
        <div style={{ borderTop: '1px solid #eee', paddingTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <h3 style={{ fontSize: 16 }}>最新动态</h3>
            <button
              onClick={() => fetchDynamics(selectedMid)}
              disabled={loading || !isLoggedIn}
              style={{
                background: '#fb7299',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                padding: '4px 12px',
                cursor: isLoggedIn ? 'pointer' : 'not-allowed',
                fontSize: 13,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? '加载中...' : '拉取最新'}
            </button>
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {dynamics.map((d, idx) => {
  let parsed: any = { title: '未知', pic: '' };
  try { parsed = JSON.parse(d.content) } catch {}

  return (
    <div
      key={d.id || idx}
      style={{
        display: 'flex',
        gap: 12,
        padding: '12px 0',
        borderBottom: '1px solid #eee',
        cursor: d.video_bvid ? 'pointer' : 'default',
      }}
      onClick={() => {
        if (d.video_bvid) window.electronAPI?.request(`https://www.bilibili.com/video/${d.video_bvid}`)
      }}
    >
      {parsed.pic && (
        <img
          src={parsed.pic}
          alt=""
          style={{
            width: 120,
            height: 68,
            borderRadius: 6,
            objectFit: 'cover',
            backgroundColor: '#f0f0f0',
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>
          {parsed.title || '无标题'}
        </div>
        <div style={{ color: '#999', fontSize: 12 }}>
          {new Date(d.timestamp * 1000).toLocaleString()}
        </div>
      </div>
    </div>
  );
})}
            {dynamics.length === 0 && <div style={{ color: '#999' }}>没有动态记录，请点击“拉取最新”</div>}
          </div>
        </div>
      )}
    </div>
  )
}

export default MarkedUps