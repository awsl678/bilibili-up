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
    const updated = await Promise.all(
      videoList.map(async (v) => {
        if (v.fanCount !== undefined) return v
        const info = await getUpInfo(v.owner.mid)
        return { ...v, fanCount: info?.follower ?? 0 }
      })
    )
    setVideos(updated)
  }, [])

  // 加载推荐视频
  const fetchVideos = useCallback(async () => {
    if (loading || !hasMore) return
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
        }
      } else {
        console.error('请求推荐失败', res)
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

  // 仅当 sortKey / sortMetric 变化时才更新快照；新数据自动归为"未排序"追加到末尾
  useEffect(() => {
    if (sortMetric !== 'none' && sortKey > 0) {
      sortedIdsRef.current = new Set(videos.map(v => v.id))
    } else {
      sortedIdsRef.current = new Set()
    }
  }, [sortKey, sortMetric])

  // 刷新后数据加载完毕 → 执行排序
  useEffect(() => {
    if (needsResortRef.current && !loading && videos.length > 0) {
      needsResortRef.current = false
      setSortKey(k => k + 1)
    }
  }, [loading, videos.length])

  const sortedVideos = useMemo(() => {
    if (sortMetric === 'none') return videos
    const snapshot = sortedIdsRef.current
    if (snapshot.size === 0) return videos

    const known: VideoWithFan[] = []
    const unknown: VideoWithFan[] = []
    for (const v of videos) {
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
  }, [videos, sortMetric, sortOrder, sortKey])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>推荐</h2>
        {videos.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
          <VideoCard key={video.id} video={video} />
        ))}
      </div>

      <div ref={loaderRef} style={{ padding: '20px', textAlign: 'center' }}>
        {loading && <div className="loading-indicator">⏳ 正在加载...</div>}
        {!hasMore && <div className="no-more-indicator">没有更多了</div>}
      </div>
    </div>
  )
}

export default Home