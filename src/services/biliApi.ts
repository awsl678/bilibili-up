import { wbiSign } from './wbiSign'

// 匿名请求
async function requestAnonymous<T = any>(url: string, options?: { method?: string; headers?: Record<string, string> }, needSign = false): Promise<T> {
  let finalUrl = url
  if (needSign) {
    const separator = url.includes('?') ? '&' : '?'
    const paramStr = url.split('?')[1] || ''
    const params: Record<string, any> = {}
    if (paramStr) {
      paramStr.split('&').forEach(pair => {
        const [k, v] = pair.split('=')
        if (k) params[k] = decodeURIComponent(v)
      })
    }
    const signedParams = await wbiSign(params)
    const newQuery = Object.entries(signedParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    finalUrl = url.split('?')[0] + '?' + newQuery
  }
  const res = await window.electronAPI!.request(finalUrl, { ...options, useAuth: false })
  if (res.error) throw new Error(res.error)
  return res.data
}

// 认证请求（使用 net.request 携带 cookie）
async function requestAuth<T = any>(url: string, options?: { method?: string; headers?: Record<string, string> }, needSign = false): Promise<T> {
  let finalUrl = url
  // 注意：认证请求一般不签名，因为 net.request 自带 cookie，但某些接口仍需签名。这里我们直接透传，不自动签名，调用方负责确认。
  if (needSign) {
    const separator = url.includes('?') ? '&' : '?'
    const paramStr = url.split('?')[1] || ''
    const params: Record<string, any> = {}
    if (paramStr) {
      paramStr.split('&').forEach(pair => {
        const [k, v] = pair.split('=')
        if (k) params[k] = decodeURIComponent(v)
      })
    }
    const signedParams = await wbiSign(params)
    const newQuery = Object.entries(signedParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    finalUrl = url.split('?')[0] + '?' + newQuery
  }
  const res = await window.electronAPI!.request(finalUrl, { ...options, useAuth: true })
  if (res.error) throw new Error(res.error)
  return res.data
}

// 推荐、分区、搜索等保持不变（使用 requestAnonymous）
export interface VideoItem { id: number; bvid: string; title: string; pic: string; duration: string; owner: { mid: number; name: string; face: string }; stat: { view: number; danmaku: number }; pubdate: number }
export interface RecommendResponse { code: number; message: string; data: { item: VideoItem[] } }
export function getRecommendVideos(freshIdx = 0) {
  return requestAnonymous<RecommendResponse>(`https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd?y_num=10&fresh_idx=${freshIdx}&feed_version=V8`, {}, true)
}

export interface RegionVideoItem { aid: number; bvid: string; title: string; pic: string; duration: number; owner: { mid: number; name: string; face: string }; stat: { view: number; danmaku: number }; pubdate: number }
export interface RegionVideoResponse { code: number; message: string; data: { archives: RegionVideoItem[]; page: { count: number; num: number; size: number } } }
export const REGION_IDS: Record<string, number> = {
  '动画': 1, '番剧': 13, '国创': 167, '音乐': 3, '舞蹈': 129, '游戏': 4, '知识': 36, '科技': 188, '运动': 234, '汽车': 223, '生活': 160, '美食': 211, '动物圈': 217, '鬼畜': 119, '时尚': 155, '娱乐': 5, '影视': 181, '纪录片': 177, '电影': 23, '电视剧': 11, '综艺': 159, '原创': 168, '新人': 222, '潮流': 209,
}
export function getRegionVideos(rid: number, page = 1, pageSize = 20) {
  return requestAnonymous<RegionVideoResponse>(`https://api.bilibili.com/x/web-interface/dynamic/region?rid=${rid}&pn=${page}&ps=${pageSize}`, {}, true)
}

export interface SearchVideoItem { id: number; bvid: string; title: string; pic: string; duration: string; owner: { mid: number; name: string; face: string }; stat: { view: number; danmaku: number }; pubdate: number }
export interface SearchResponse { code: number; data: { result: SearchVideoItem[] } }
export function searchVideos(keyword: string, page = 1, pageSize = 20) {
  return requestAnonymous<SearchResponse>(`https://api.bilibili.com/x/web-interface/wbi/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}&page=${page}&page_size=${pageSize}`, {}, true)
}

// ---------- UP 主信息（优先使用 card 认证接口，失败后降级） ----------
export interface UpInfo { mid: number; name: string; face: string; follower: number; video_count: number; total_play: number }
const upInfoCache = new Map<number, UpInfo>()

interface CardResponse {
  code: number
  data: {
    card: { mid: string; name: string; face: string; fans: number }
    archive_count: number
    follower: number
    like_num: number
  }
}

async function getUpCard(mid: number): Promise<UpInfo | null> {
  try {
    const res = await requestAuth<CardResponse>(`https://api.bilibili.com/x/web-interface/card?mid=${mid}&photo=1`)
    if (res.code === 0 && res.data) {
      const card = res.data.card
      return {
        mid: Number(card.mid),
        name: card.name,
        face: card.face,
        follower: card.fans || res.data.follower || 0,
        video_count: res.data.archive_count || 0,
        total_play: 0, // card 接口无总播放
      }
    }
  } catch (e) { console.warn('card 接口失败，准备降级粉丝接口') }
  return null
}

// 降级：仅获取粉丝数（匿名）
async function getFollowerCount(mid: number): Promise<number | null> {
  try {
    const res = await requestAnonymous<{ code: number; data: { follower: number } }>(`https://api.bilibili.com/x/relation/stat?vmid=${mid}`)
    if (res.code === 0 && res.data) return res.data.follower ?? 0
  } catch (e) { console.error('获取粉丝数失败', e) }
  return null
}

export async function getUpInfo(mid: number): Promise<UpInfo | null> {
  if (upInfoCache.has(mid)) return upInfoCache.get(mid)!
  const info = await getUpCard(mid)
  if (info) { upInfoCache.set(mid, info); return info }
  const follower = await getFollowerCount(mid)
  if (follower !== null) {
    const fallback: UpInfo = { mid, name: '', face: '', follower, video_count: 0, total_play: 0 }
    upInfoCache.set(mid, fallback)
    return fallback
  }
  return null
}
// ---------- 搜索 UP 主（匿名，需签名） ----------
export interface SearchUpUserItem {
  mid: number
  uname: string
  upic: string
  fans: number
  videos: number
  ctime: number
}

export interface SearchUpUserResponse {
  code: number
  data: {
    result: SearchUpUserItem[]
  }
}

export function searchUpUsers(keyword: string, page = 1, pageSize = 20) {
  return requestAnonymous<SearchUpUserResponse>(
    `https://api.bilibili.com/x/web-interface/wbi/search/type?search_type=bili_user&keyword=${encodeURIComponent(keyword)}&page=${page}&page_size=${pageSize}`,
    {},
    true
  )
}