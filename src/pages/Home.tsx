import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import VideoCard from '../components/VideoCard'
import { getRecommendVideos, getUpInfo, type VideoItem } from '../services/biliApi'

interface VideoWithFan extends VideoItem {
  fanCount?: number
}

const Home: React.FC = () => {
  const [videos, setVideos] = useState<VideoWithFan[]>([])
  const [loading, setLoading] = useState(false)
  const [freshIdx, setFreshIdx] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const loaderRef = useRef<HTMLDivElement>(null)

  // 排序状态
  const [sortMetric, setSortMetric] = useState<string>('none') // none, play, danmaku, fan
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [sortKey, setSortKey] = useState(0)         // 递增触发重排
  const sortedIdsRef = useRef<Set<number>>(new Set())
  const needsResortRef = useRef(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const [onlyMarked, setOnlyMarked] = useState(false)
  const [markedMids, setMarkedMids] = useState<Set<number>>(new Set())
  const emptyPageRef = useRef(0)

  const refreshMarkedMids = useCallback(() => {
    window.electronAPI?.dbGetMarkedUps().then((list: any[]) => {
      if (Array.isArray(list)) setMarkedMids(new Set(list.map(u => u.mid)))
    })
  }, [])

  useEffect(() => { refreshMarkedMids() }, [refreshMarkedMids])
  useEffect(() => { emptyPageRef.current = 0 }, [onlyMarked])

  const handleRefresh = () => {
    if (loading) return
    setVideos([])
    setFreshIdx(0)
    setHasMore(true)
    if (sortMetric !== 'none') needsResortRef.current = true
    setSortKey(k => k + 1) // 重置 sortedIdsRef
    setRefreshKey(k => k + 1)
  }

  // 获取粉丝数补充
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

  // 加载推荐视频
  const fetchVideos = useCallback(async () => {
    const effectiveHasMore = onlyMarked ? hasMore && emptyPageRef.current < 5 : hasMore
    if (loading || !effectiveHasMore) return
    setLoading(true)
    try {
      const res = await getRecommendVideos(freshIdx)
      if (res.code === 0) {
        const newVideos = res.data.item as VideoWithFan[]
        if (newVideos.length === 0) {
          setHasMore(false)
        } else {
          setVideos(prev => {
            const existingIds = new Set(prev.map(v => v.id))
            const unique = newVideos.filter(v => !existingIds.has(v.id))
            return [...prev, ...unique]
          })
          setFreshIdx(prev => prev + newVideos.length)
          if (onlyMarked) {
            const hitCount = newVideos.filter(v => markedMids.has(v.owner.mid)).length
            emptyPageRef.current = hitCount === 0 ? emptyPageRef.current + 1 : 0
          }
        }
      } else {
        console.error('请求推荐失败', res)
        if (res.code === -412 || res.code === -352) setHasMore(false)
      }
    } catch (err) {
      console.error('网络错误', err)
    } finally {
      setLoading(false)
    }
  }, [freshIdx, loading, hasMore])

  // 首次加载 & 刷新
  useEffect(() => {
    fetchVideos()
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // 无限滚动
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          fetchVideos()
        }
      },
      { threshold: 0.5 }
    )
    const el = loaderRef.current
    if (el) observer.observe(el)
    return () => {
      if (el) observer.unobserve(el)
    }
  }, [fetchVideos])

  // 视频数据变化时补充粉丝数
  useEffect(() => {
    if (videos.length === 0) return
    enrichVideosWithFans(videos)
  }, [videos.length, enrichVideosWithFans])

  // 渲染期间同步更新快照（必须在 useMemo 之前，否则读到旧值）
  const prevSortKeyRef = useRef(sortKey)
  const prevSortMetricRef = useRef(sortMetric)
  if (sortKey !== prevSortKeyRef.current || sortMetric !== prevSortMetricRef.current) {
    if (sortMetric !== 'none' && sortKey > 0) {
      sortedIdsRef.current = new Set(videos.map(v => v.id))
    } else {
      sortedIdsRef.current = new Set()
    }
    prevSortKeyRef.current = sortKey
    prevSortMetricRef.current = sortMetric
  }

  // 刷新后数据加载完毕 → 执行排序
  useEffect(() => {
    if (needsResortRef.current && !loading && videos.length > 0) {
      needsResortRef.current = false
      setSortKey(k => k + 1)
    }
  }, [loading, videos.length])

  // 只看收藏筛选
  const baseVideos = useMemo(() => {
    if (!onlyMarked || markedMids.size === 0) return videos
    return videos.filter(v => markedMids.has(v.owner.mid))
  }, [videos, onlyMarked, markedMids])

  const sortedVideos = useMemo(() => {
    if (sortMetric === 'none') return baseVideos
    const snapshot = sortedIdsRef.current
    if (snapshot.size === 0) return baseVideos

    const known: VideoWithFan[] = []
    const unknown: VideoWithFan[] = []
    for (const v of baseVideos) {
      if (snapshot.has(v.id)) known.push(v)
      else unknown.push(v)
    }

    const multiplier = sortOrder === 'asc' ? 1 : -1
    if (sortMetric === 'play') {
      known.sort((a, b) => ((a.stat?.view || 0) - (b.stat?.view || 0)) * multiplier)
    } else if (sortMetric === 'danmaku') {
      known.sort((a, b) => ((a.stat?.danmaku || 0) - (b.stat?.danmaku || 0)) * multiplier)
    } else if (sortMetric === 'fan') {
      known.sort((a, b) => {
        const af = a.fanCount ?? -1
        const bf = b.fanCount ?? -1
        return (af - bf) * multiplier
      })
    }
    return [...known, ...unknown]
  }, [baseVideos, sortMetric, sortOrder, sortKey])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>推荐</h2>
        {videos.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setOnlyMarked(!onlyMarked)}
              title="只看已收藏UP主的视频"
              style={{
                padding: '2px 10px', borderRadius: 4, border: '1px solid #ddd',
                background: onlyMarked ? '#fce4ec' : '#fff',
                color: onlyMarked ? '#fb7299' : '#666',
                cursor: 'pointer', fontSize: 12, fontWeight: onlyMarked ? 600 : 400,
              }}
            >★ 收藏</button>
            <button
              onClick={handleRefresh}
              disabled={loading}
              title="刷新"
              style={{
                padding: '2px 10px', borderRadius: 4, border: '1px solid #ddd',
                background: '#fff', color: loading ? '#ccc' : '#666', cursor: loading ? 'default' : 'pointer', fontSize: 13,
              }}
            >↻</button>
            <select
              value={sortMetric}
              onChange={(e) => { setSortMetric(e.target.value); setSortKey(k => k + 1) }}
              style={{
                padding: '2px 8px', borderRadius: 4, border: '1px solid #ddd',
                fontSize: 13, background: '#fff', color: '#333', cursor: 'pointer',
              }}
            >
              <option value="none">默认排序</option>
              <option value="play">按播放量</option>
              <option value="danmaku">按弹幕数</option>
              <option value="fan">按粉丝数</option>
            </select>
            <button
              onClick={() => { setSortOrder('asc'); setSortKey(k => k + 1) }}
              style={{
                padding: '2px 8px', borderRadius: 4, border: '1px solid #ddd',
                background: sortOrder === 'asc' ? '#fce4ec' : '#fff',
                color: sortOrder === 'asc' ? '#fb7299' : '#666', cursor: 'pointer', fontSize: 14,
              }}
            >↑</button>
            <button
              onClick={() => { setSortOrder('desc'); setSortKey(k => k + 1) }}
              style={{
                padding: '2px 8px', borderRadius: 4, border: '1px solid #ddd',
                background: sortOrder === 'desc' ? '#fce4ec' : '#fff',
                color: sortOrder === 'desc' ? '#fb7299' : '#666', cursor: 'pointer', fontSize: 14,
              }}
            >↓</button>
          </div>
        )}
      </div>

      <div className="video-grid">
        {sortedVideos.map(video => (
          <VideoCard key={video.id} video={video} markedMids={markedMids} onCollectChange={refreshMarkedMids} />
        ))}
      </div>

      <div ref={loaderRef} style={{ padding: '20px', textAlign: 'center' }}>
        {loading && <div className="loading-indicator">⏳ 正在加载...</div>}
        {!loading && !hasMore && baseVideos.length > 0 && (
          <div className="no-more-indicator">没有更多了</div>
        )}
        {!loading && onlyMarked && baseVideos.length === 0 && (
          <div className="no-more-indicator" style={{ color: '#e67e22' }}>
            当前推荐流中暂无收藏UP主的视频<br />
            <span style={{ fontSize: 12, color: '#999' }}>收藏的UP主可能在分区页面中找到</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default Home