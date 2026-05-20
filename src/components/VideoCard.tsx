import React, { useEffect, useState } from 'react'
import type { VideoItem, UpInfo } from '../services/biliApi'
import { getUpInfo } from '../services/biliApi'
import { useTabs } from '../contexts/TabContext'

interface VideoCardProps {
  video: VideoItem
}

const VideoCard: React.FC<VideoCardProps> = ({ video }) => {
  const { openTab } = useTabs()
  const [upInfo, setUpInfo] = useState<UpInfo | null>(null)
  const [isMarked, setIsMarked] = useState(false)

  // 检查是否已标记
  useEffect(() => {
    window.electronAPI?.dbGetMarkedUps().then((list: any[]) => {
      if (Array.isArray(list)) {
        setIsMarked(list.some((u: any) => u.mid === video.owner.mid))
      }
    })
  }, [video.owner.mid])

  useEffect(() => {
  const mid = video.owner?.mid
  if (!mid) return
  getUpInfo(mid).then(info => { if (info) setUpInfo(info) })
}, [video.owner?.mid])

  const pubDate = video.pubdate
    ? new Date(video.pubdate * 1000).toLocaleDateString()
    : '未知'

  const handleMark = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isMarked) {
      await window.electronAPI?.dbUnmarkUp(video.owner.mid)
      setIsMarked(false)
    } else {
      await window.electronAPI?.dbMarkUp({
        mid: video.owner.mid,
        name: video.owner.name,
        face: video.owner.face,
      })
      setIsMarked(true)
    }
  }

  return (
    <div className="video-card-new">
      <div className="card-top">
        <div className="card-top-left">
          <img
            src={video.owner?.face || ''}
            alt={video.owner?.name || '未知UP主'}
            className="up-avatar-large"
            onClick={(e) => {
              e.stopPropagation()
              openTab(`https://space.bilibili.com/${video.owner.mid}`)
            }}
          />
        </div>
        <div className="card-top-right">
          <span className="card-up-name">
            {video.owner?.name || '未知UP主'}
          </span>
          <span className="card-stat">
            粉丝 {upInfo ? formatCount(upInfo.follower) : '...'}
            <span className="card-stat-dot"></span>
            {pubDate}
          </span>
          <span
            className="card-title-link"
            onClick={(e) => {
              e.stopPropagation()
              openTab(`https://www.bilibili.com/video/${video.bvid}`)
            }}
            title={video.title}
          >
            {video.title}
          </span>
          <span className="card-stat">
            ▶ {formatCount(video.stat?.view)}
            <span className="card-stat-dot"></span>
            弹幕 {formatCount(video.stat?.danmaku)}
          </span>
        </div>
        <button className="favorite-btn" onClick={handleMark} title={isMarked ? '取消收藏' : '收藏此UP主'}>
          {isMarked ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fb7299">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

function formatCount(num: number): string {
  if (num == null) return '--'
  if (num >= 10000) return (num / 10000).toFixed(1) + '万'
  return String(num)
}

export default VideoCard