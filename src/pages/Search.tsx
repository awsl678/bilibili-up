import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import VideoCard from '../components/VideoCard'
import { searchVideos, searchUpUsers, getUpInfo, type SearchUpUserItem } from '../services/biliApi'
import type { VideoItem } from '../services/biliApi'
import { useTabs } from '../contexts/TabContext'

// ---------- 视频转换（修复 UP 信息、标题标签、封面协议） ----------
function convertToVideoItem(item: any): VideoItem {
  const name = item.author || '未知UP主'
  const face = item.upic || ''
  const mid = item.mid || 0
  const dur = typeof item.duration === 'string' ? item.duration : '00:00'
  const cleanTitle = item.title?.replace(/<[^>]+>/g, '') || ''
  const pic = item.pic?.startsWith('//') ? `https:${item.pic}` : item.pic || ''

  return {
    id: item.aid || item.id,
    bvid: item.bvid || '',
    title: cleanTitle,
    pic,
    duration: dur,
    owner: { mid, name, face },
    stat: {
      view: item.play || item.stat?.view || 0,
      danmaku: item.danmaku || item.stat?.danmaku || 0,
    },
    pubdate: item.pubdate || item.created || 0,
  }
}

// ---------- 工具 ----------
function formatCount(num: number): string {
  if (num == null) return '--'
  if (num >= 10000) return (num / 10000).toFixed(1) + '万'
  return String(num)
}

interface VideoWithFan extends VideoItem {
  fanCount?: number   // 扩展字段，保存 UP 粉丝数
}

interface SearchProps { keyword: string; onClose: () => void }

const Search: React.FC<SearchProps> = ({ keyword, onClose }) => {
  const { openTab } = useTabs()
  const [tab, setTab] = useState<'video' | 'up'>('video')
  const [videos, setVideos] = useState<VideoWithFan[]>([])
  const [ups, setUps] = useState<SearchUpUserItem[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const loaderRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<() => void>(() => {})

  // 整合排序状态
  const [sortMetric, setSortMetric] = useState<string>('play')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [markedMids, setMarkedMids] = useState<Set<number>>(new Set())

  const refreshMarkedMids = useCallback(() => {
    window.electronAPI?.dbGetMarkedUps().then((list: any[]) => {
      if (Array.isArray(list)) setMarkedMids(new Set(list.map(u => u.mid)))
    })
  }, [])

  useEffect(() => { refreshMarkedMids() }, [refreshMarkedMids])

  const videoSortOptions = [
    { value: 'play', label: '按播放量' },
    { value: 'danmaku', label: '按弹幕数' },
    { value: 'fan', label: '按粉丝数' },
  ]
  const upSortOptions = [
    { value: 'fans', label: '按粉丝数' },
    { value: 'videos', label: '按视频数' },
  ]
  const currentSortOptions = tab === 'video' ? videoSortOptions : upSortOptions

  // 切换 tab 或关键词时重置
  useEffect(() => {
    setVideos([])
    setUps([])
    setPage(1)
    setHasMore(true)
    setSortMetric(tab === 'video' ? 'play' : 'fans')
    setSortOrder('asc')
  }, [tab, keyword])

  // 为视频批量补充粉丝数（利用 getUpInfo 缓存）
  const enrichVideosWithFans = useCallback(async (videoList: VideoWithFan[]) => {
    const toEnrich = videoList.filter(v => v.fanCount === undefined)
    if (toEnrich.length === 0) return
    const enriched = await Promise.all(
      toEnrich.map(async (v) => {
        const info = await getUpInfo(v.owner.mid)
        return { id: v.id, fanCount: info?.follower ?? 0 }
      })
    )
    const enrichMap = new Map(enriched.map(e => [e.id, e.fanCount]))
    setVideos(prev => prev.map(v => {
      const fc = enrichMap.get(v.id)
      return fc !== undefined ? { ...v, fanCount: fc } : v
    }))
  }, [])

  // ---------- 视频首次加载 ----------
  const fetchFirstVideos = useCallback(async () => {
    setLoading(true)
    try {
      const res = await searchVideos(keyword, 1, 20)
      if (res.code === 0 && res.data.result) {
        const newVideos = res.data.result.map(convertToVideoItem)
        setVideos(newVideos)
        setPage(2)
        setHasMore(newVideos.length > 0)
      } else {
        setHasMore(false)
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [keyword])

  // ---------- UP 首次加载 ----------
  const fetchFirstUps = useCallback(async () => {
    setLoading(true)
    try {
      const res = await searchUpUsers(keyword, 1, 20)
      if (res.code === 0 && res.data.result) {
        setUps(res.data.result)
        setPage(2)
        setHasMore(res.data.result.length > 0)
      } else {
        setHasMore(false)
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [keyword])

  useEffect(() => {
    if (tab === 'video') fetchFirstVideos()
    else fetchFirstUps()
  }, [fetchFirstVideos, fetchFirstUps, tab])

  // ---------- 加载更多（视频） ----------
  const fetchMoreVideos = useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)
    try {
      const res = await searchVideos(keyword, page, 20)
      if (res.code === 0 && res.data.result) {
        const newVideos = res.data.result.map(convertToVideoItem)
        if (newVideos.length === 0) {
          setHasMore(false)
        } else {
          setVideos(prev => {
            const ids = new Set(prev.map(v => v.id))
            return [...prev, ...newVideos.filter(v => !ids.has(v.id))]
          })
          setPage(prev => prev + 1)
        }
      } else { setHasMore(false) }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [keyword, page, loading, hasMore])

  // ---------- 加载更多（UP） ----------
  const fetchMoreUps = useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)
    try {
      const res = await searchUpUsers(keyword, page, 20)
      if (res.code === 0 && res.data.result) {
        const newUps = res.data.result
        if (newUps.length === 0) {
          setHasMore(false)
        } else {
          setUps(prev => {
            const ids = new Set(prev.map(u => u.mid))
            return [...prev, ...newUps.filter(u => !ids.has(u.mid))]
          })
          setPage(prev => prev + 1)
        }
      } else { setHasMore(false) }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [keyword, page, loading, hasMore])

  // 动态更新滚动加载函数
  useEffect(() => {
    loadMoreRef.current = tab === 'video' ? fetchMoreVideos : fetchMoreUps
  }, [tab, fetchMoreVideos, fetchMoreUps])

  // 无限滚动监听
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMoreRef.current() },
      { threshold: 0.5 }
    )
    const el = loaderRef.current
    if (el) observer.observe(el)
    return () => { if (el) observer.unobserve(el) }
  }, [])

  // 视频数据变化时自动补充粉丝数（利用缓存，避免重复请求）
  useEffect(() => {
    if (videos.length === 0) return
    enrichVideosWithFans(videos)
  }, [videos.length, enrichVideosWithFans])

  // ---------- 排序后的数据 ----------
  const sortedVideos = useMemo(() => {
    const sorted = [...videos]
    const multiplier = sortOrder === 'asc' ? 1 : -1
    if (sortMetric === 'play') {
      sorted.sort((a, b) => ((a.stat?.view || 0) - (b.stat?.view || 0)) * multiplier)
    } else if (sortMetric === 'danmaku') {
      sorted.sort((a, b) => ((a.stat?.danmaku || 0) - (b.stat?.danmaku || 0)) * multiplier)
    } else if (sortMetric === 'fan') {
      // 没有粉丝数的排到最后
      sorted.sort((a, b) => {
        const af = a.fanCount ?? -1
        const bf = b.fanCount ?? -1
        return (af - bf) * multiplier
      })
    }
    return sorted
  }, [videos, sortMetric, sortOrder])

  const sortedUps = useMemo(() => {
    const sorted = [...ups]
    const multiplier = sortOrder === 'asc' ? 1 : -1
    if (sortMetric === 'fans') {
      sorted.sort((a, b) => (a.fans - b.fans) * multiplier)
    } else if (sortMetric === 'videos') {
      sorted.sort((a, b) => (a.videos - b.videos) * multiplier)
    }
    return sorted
  }, [ups, sortMetric, sortOrder])

  // 切换排序指标时重置顺序为升序
  const handleMetricChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortMetric(e.target.value)
    setSortOrder('asc')
  }

  // ---------- 渲染 ----------
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18 }}>搜索结果：{keyword}</h2>
        <button onClick={onClose} style={{ cursor: 'pointer', background: 'none', border: '1px solid #ccc', borderRadius: 4, padding: '4px 12px' }}>
          关闭
        </button>
      </div>

      {/* 选项卡 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => setTab('video')} style={{
          padding: '4px 16px', borderRadius: 16,
          border: tab === 'video' ? '1px solid #fb7299' : '1px solid #ddd',
          background: tab === 'video' ? '#fce4ec' : '#f5f5f5',
          color: tab === 'video' ? '#fb7299' : '#666',
          cursor: 'pointer', fontSize: 13,
        }}>视频</button>
        <button onClick={() => setTab('up')} style={{
          padding: '4px 16px', borderRadius: 16,
          border: tab === 'up' ? '1px solid #fb7299' : '1px solid #ddd',
          background: tab === 'up' ? '#fce4ec' : '#f5f5f5',
          color: tab === 'up' ? '#fb7299' : '#666',
          cursor: 'pointer', fontSize: 13,
        }}>UP 主</button>
      </div>

      {/* 整合排序栏 */}
      {((tab === 'video' && videos.length > 0) || (tab === 'up' && ups.length > 0)) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <select value={sortMetric} onChange={handleMetricChange}
            style={{
              padding: '2px 8px', borderRadius: 4, border: '1px solid #ddd',
              fontSize: 13, background: '#fff', color: '#333', cursor: 'pointer',
            }}
          >
            {currentSortOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button onClick={() => setSortOrder('asc')}
            style={{
              padding: '2px 8px', borderRadius: 4, border: '1px solid #ddd',
              background: sortOrder === 'asc' ? '#fce4ec' : '#fff',
              color: sortOrder === 'asc' ? '#fb7299' : '#666', cursor: 'pointer', fontSize: 14,
            }}>↑</button>
          <button onClick={() => setSortOrder('desc')}
            style={{
              padding: '2px 8px', borderRadius: 4, border: '1px solid #ddd',
              background: sortOrder === 'desc' ? '#fce4ec' : '#fff',
              color: sortOrder === 'desc' ? '#fb7299' : '#666', cursor: 'pointer', fontSize: 14,
            }}>↓</button>
        </div>
      )}

      {/* 视频列表 */}
      {tab === 'video' && (
        <div className="video-grid">
          {sortedVideos.map(video => (<VideoCard key={video.id} video={video} markedMids={markedMids} onCollectChange={refreshMarkedMids} />))}
        </div>
      )}

      {/* UP 主列表 */}
      {tab === 'up' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sortedUps.map(up => (
            <div
              key={up.mid}
              onClick={() => openTab(`https://space.bilibili.com/${up.mid}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', cursor: 'pointer',
              }}
            >
              <img src={up.upic} alt={up.uname} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', background: '#eee' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{up.uname}</div>
                <div style={{ fontSize: 13, color: '#666' }}>
                  粉丝 {formatCount(up.fans)} · 视频 {up.videos}
                </div>
              </div>
            </div>
          ))}
          {ups.length === 0 && !loading && <div style={{ color: '#999', textAlign: 'center' }}>没有找到相关 UP 主</div>}
        </div>
      )}

      <div ref={loaderRef} style={{ padding: '20px', textAlign: 'center' }}>
        {loading && <div className="loading-indicator">⏳ 正在加载...</div>}
        {!hasMore && <div className="no-more-indicator">没有更多了</div>}
      </div>
    </div>
  )
}

export default Search