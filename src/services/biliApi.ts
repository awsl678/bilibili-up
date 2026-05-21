// ---------- 推荐 & 分区（浏览器代理 fetch，WBI 签名在主进程完成） ----------
export interface VideoItem { id: number; bvid: string; title: string; pic: string; duration: string; owner: { mid: number; name: string; face: string }; stat: { view: number; danmaku: number }; pubdate: number }
export interface RecommendResponse { code: number; message: string; data: { item: VideoItem[] } }

const RECOMMEND_BASE = 'https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd'

export function getRecommendVideos(freshIdx = 0) {
  return window.electronAPI!.fetchSignedApi(RECOMMEND_BASE,
    { y_num: '10', fresh_idx: String(freshIdx), feed_version: 'V8' },
    'https://www.bilibili.com/'
  ) as Promise<RecommendResponse>
}

export interface RegionVideoItem { aid: number; bvid: string; title: string; pic: string; duration: number; owner: { mid: number; name: string; face: string }; stat: { view: number; danmaku: number }; pubdate: number }
export interface RegionVideoResponse { code: number; message: string; data: { archives: RegionVideoItem[]; page: { count: number; num: number; size: number } } }
export const REGION_IDS: Record<string, number> = {
  '动画': 1, '国创': 167, '音乐': 3, '舞蹈': 129, '游戏': 4, '知识': 36, '科技': 188, '运动': 234, '汽车': 223, '生活': 160, '美食': 211, '动物圈': 217, '鬼畜': 119, '时尚': 155, '娱乐': 5, '影视': 181,  '综艺': 159, '原创': 168, '新人': 222, '潮流': 209,
}

export function getRegionVideos(rid: number, page = 1, pageSize = 20) {
  const url = `https://api.bilibili.com/x/web-interface/dynamic/region?rid=${rid}&pn=${page}&ps=${pageSize}`
  return window.electronAPI!.fetchPlainApi(url, 'https://www.bilibili.com/') as Promise<RegionVideoResponse>
}

// ---------- 搜索（浏览器代理 fetch） ----------
export interface SearchVideoItem { id: number; bvid: string; title: string; pic: string; duration: string; owner: { mid: number; name: string; face: string }; stat: { view: number; danmaku: number }; pubdate: number }
export interface SearchResponse { code: number; data: { result: SearchVideoItem[] } }
const SEARCH_BASE = 'https://api.bilibili.com/x/web-interface/wbi/search/type'

export function searchVideos(keyword: string, page = 1, pageSize = 20) {
  return window.electronAPI!.fetchViaBrowser(SEARCH_BASE,
    { search_type: 'video', keyword, page: String(page), page_size: String(pageSize) },
    'https://search.bilibili.com/'
  ) as Promise<SearchResponse>
}

export interface SearchUpUserItem { mid: number; uname: string; upic: string; fans: number; videos: number; ctime: number }
export interface SearchUpUserResponse { code: number; data: { result: SearchUpUserItem[] } }
export function searchUpUsers(keyword: string, page = 1, pageSize = 20) {
  return window.electronAPI!.fetchViaBrowser(SEARCH_BASE,
    { search_type: 'bili_user', keyword, page: String(page), page_size: String(pageSize) },
    'https://search.bilibili.com/'
  ) as Promise<SearchUpUserResponse>
}

// ---------- UP 信息（空间页标准接口 + WBI 签名，无需登录） ----------
export interface UpInfo { mid: number; name: string; face: string; follower: number; video_count: number; total_play: number }
const upInfoCache = new Map<number, UpInfo | null>()

// UP 信息专用节流：控制请求频率，避免触发接口风控
const upInfoLimiter = {
  lastRequestTime: 0,
  minInterval: 1500,
  async waitForSlot() {
    const now = Date.now()
    const elapsed = now - this.lastRequestTime
    if (elapsed < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - elapsed))
    }
    this.lastRequestTime = Date.now()
  }
}

async function getCardInfo(mid: number): Promise<UpInfo | null> {
  if (upInfoCache.has(mid)) return upInfoCache.get(mid)!

  await upInfoLimiter.waitForSlot()

  try {
    const data = await window.electronAPI!.getUpInfoViaPage(mid)

    if (data?.code === 0) {
      const card = data.data
      const info: UpInfo = {
        mid: card.mid || mid,
        name: card.name || '',
        face: card.face || '',
        follower: card.fans ?? card.follower ?? 0,
        video_count: card.archive_count ?? 0,
        total_play: card.archive_view ?? card.total_play_count ?? 0,
      }
      if (info.follower === 0 && card.fans === undefined && card.follower === undefined) {
        // 尝试从 card 对象其他字段获取
        const stat = card.stat || {}
        info.follower = stat.follower ?? stat.fans ?? 0
      }
      upInfoCache.set(mid, info)
      return info
    }

    if (data?.code === -352 || data?.code === -509 || data?.code === -799) {
      console.warn(`[getCardInfo] ${mid} 接口风控(code=${data.code})`)
      upInfoCache.set(mid, null as any)
      setTimeout(() => upInfoCache.delete(mid), 2 * 60 * 1000)
      return null
    }

    console.warn(`[getCardInfo] ${mid} 接口返回异常(code=${data?.code})`)
    upInfoCache.set(mid, null as any)
    setTimeout(() => upInfoCache.delete(mid), 2 * 60 * 1000)
  } catch (e) {
    console.error('获取 UP 信息失败', e)
    upInfoCache.set(mid, null as any)
    setTimeout(() => upInfoCache.delete(mid), 2 * 60 * 1000)
  }
  return null
}

export async function getUpInfo(mid: number): Promise<UpInfo | null> {
  return getCardInfo(mid)
}