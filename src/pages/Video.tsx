import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import VideoCard from '../components/VideoCard'
import { getRegionVideos, getUpInfo, REGION_IDS, type RegionVideoItem } from '../services/biliApi'
import type { VideoItem } from '../services/biliApi'

function convertToVideoItem(item: RegionVideoItem): VideoItem {
  return {
    id: item.aid,
    bvid: item.bvid,
    title: item.title,
    pic: item.pic,
    duration: String(item.duration),
    owner: item.owner,
    stat: item.stat,
    pubdate: item.pubdate,
  }
}

interface VideoWithFan extends VideoItem {
  fanCount?: number
}

interface VideoProps {
  region: string
}

const Video: React.FC<VideoProps> = ({ region }) => {
  const [videos, setVideos] = useState<VideoWithFan[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const loaderRef = useRef<HTMLDivElement>(null)

  const [sortMetric, setSortMetric] = useState<string>('none')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [sortKey, setSortKey] = useState(0)
  const sortedIdsRef = useRef<Set<number>>(new Set())
  const needsResortRef = useRef(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleRefresh = () => {
    if (loading) return
    setVideos([])
    setPage(1)
    setHasMore(true)
    if (sortMetric !== 'none') needsResortRef.current = true
    setSortKey(k => k + 1)
    setRefreshKey(k => k + 1)
  }

  // 首次加载
  useEffect(() => {
    fetchVideos()
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const fetchVideos = useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)
    try {
      const rid = REGION_IDS[region]
      const res = await getRegionVideos(rid, page, 20)
      if (res.code === 0) {
        const newVideos = res.data.archives.map(convertToVideoItem) as VideoWithFan[]
        if (newVideos.length === 0) {
          setHasMore(false)
        } else {
          setVideos(prev => {
            const existingIds = new Set(prev.map(v => v.id))
            const unique = newVideos.filter(v => !existingIds.has(v.id))
            return [...prev, ...unique]
          })
          setPage(prev => prev + 1)
        }
      } else {
        console.error('请求分区视频失败', res)
      }
    } catch (err) {
      console.error('网络错误', err)
    } finally {
      setLoading(false)
    }
  }, [region, page, loading, hasMore])


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

  useEffect(() => {
    if (videos.length === 0) return
    enrichVideosWithFans(videos)
  }, [videos.length, enrichVideosWithFans])

  useEffect(() => {
    if (sortMetric !== 'none' && sortKey > 0) {
      sortedIdsRef.current = new Set(videos.map(v => v.id))
    } else {
      sortedIdsRef.current = new Set()
    }
  }, [sortKey, sortMetric])

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
        <h2 style={{ fontSize: 18, margin: 0 }}>{region}</h2>
        {(videos.length > 0 || hasMore) && (
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

export default Video