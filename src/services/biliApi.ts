import { wbiSign } from './wbiSign'

// ---------- 请求节流 ----------
const pendingPromises = new Map<string, Promise<any>>()
const requestRateLimiter = {
  lastRequestTime: 0,
  minInterval: 1000, // 1秒间隔，防止并发风控
  async waitForSlot() {
    const now = Date.now()
    const elapsed = now - this.lastRequestTime
    if (elapsed < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - elapsed))
    }
    this.lastRequestTime = Date.now()
  }
}

// ---------- 通用请求函数（匿名/认证） ----------
async function request<T = any>(url: string, options?: { method?: string; headers?: Record<string, string>; useAuth?: boolean }, needSign = false): Promise<T> {
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
  // 认证请求去重
  const cacheKey = finalUrl + (options?.useAuth ? ':auth' : '')
  if (pendingPromises.has(cacheKey)) {
    return pendingPromises.get(cacheKey)!
  }
  // 认证请求节流
  if (options?.useAuth) {
    await requestRateLimiter.waitForSlot()
  }
  const promise = (async () => {
    try {
      const res = await window.electronAPI!.request(finalUrl, {
        method: options?.method || 'GET',
        headers: options?.headers,
        useAuth: options?.useAuth || false,
      })
      if (res.error) throw new Error(res.error)
      return res.data
    } finally {
      pendingPromises.delete(cacheKey)
    }
  })()
  pendingPromises.set(cacheKey, promise)
  return promise
}

// ---------- 推荐、分区、搜索（匿名） ----------
export interface VideoItem { id: number; bvid: string; title: string; pic: string; duration: string; owner: { mid: number; name: string; face: string }; stat: { view: number; danmaku: number }; pubdate: number }
export interface RecommendResponse { code: number; message: string; data: { item: VideoItem[] } }
export function getRecommendVideos(freshIdx = 0) {
  return request<RecommendResponse>(`https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd?y_num=10&fresh_idx=${freshIdx}&feed_version=V8`, {}, true)
}

export interface RegionVideoItem { aid: number; bvid: string; title: string; pic: string; duration: number; owner: { mid: number; name: string; face: string }; stat: { view: number; danmaku: number }; pubdate: number }
export interface RegionVideoResponse { code: number; message: string; data: { archives: RegionVideoItem[]; page: { count: number; num: number; size: number } } }
export const REGION_IDS: Record<string, number> = {
  '动画': 1, '番剧': 13, '国创': 167, '音乐': 3, '舞蹈': 129, '游戏': 4, '知识': 36, '科技': 188, '运动': 234, '汽车': 223, '生活': 160, '美食': 211, '动物圈': 217, '鬼畜': 119, '时尚': 155, '娱乐': 5, '影视': 181, '纪录片': 177, '电影': 23, '电视剧': 11, '综艺': 159, '原创': 168, '新人': 222, '潮流': 209,
}
export function getRegionVideos(rid: number, page = 1, pageSize = 20) {
  return request<RegionVideoResponse>(`https://api.bilibili.com/x/web-interface/dynamic/region?rid=${rid}&pn=${page}&ps=${pageSize}`, {}, true)
}

export interface SearchVideoItem { id: number; bvid: string; title: string; pic: string; duration: string; owner: { mid: number; name: string; face: string }; stat: { view: number; danmaku: number }; pubdate: number }
export interface SearchResponse { code: number; data: { result: SearchVideoItem[] } }
export function searchVideos(keyword: string, page = 1, pageSize = 20) {
  return request<SearchResponse>(`https://api.bilibili.com/x/web-interface/wbi/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}&page=${page}&page_size=${pageSize}`, {}, true)
}

export interface SearchUpUserItem { mid: number; uname: string; upic: string; fans: number; videos: number; ctime: number }
export interface SearchUpUserResponse { code: number; data: { result: SearchUpUserItem[] } }
export function searchUpUsers(keyword: string, page = 1, pageSize = 20) {
  return request<SearchUpUserResponse>(`https://api.bilibili.com/x/web-interface/wbi/search/type?search_type=bili_user&keyword=${encodeURIComponent(keyword)}&page=${page}&page_size=${pageSize}`, {}, true)
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

const RATE_LIMIT_CODES = new Set([-352, -509, -799])

async function getCardInfo(mid: number): Promise<UpInfo | null> {
  if (upInfoCache.has(mid)) return upInfoCache.get(mid)!

  await upInfoLimiter.waitForSlot()

  try {
    const relRes = await request<any>(
      `https://api.bilibili.com/x/relation/stat?vmid=${mid}`,
      {},
      true
    )

    if (relRes?.code === 0 && relRes?.data) {
      const info: UpInfo = { mid, name: '', face: '', follower: relRes.data.follower ?? 0, video_count: 0, total_play: 0 }
      upInfoCache.set(mid, info)
      return info
    }

    if (RATE_LIMIT_CODES.has(relRes?.code)) {
      console.warn(`[getCardInfo] ${mid} 粉丝数接口风控(code=${relRes.code})`)
      upInfoCache.set(mid, null as any)
      setTimeout(() => upInfoCache.delete(mid), 2 * 60 * 1000)
    }
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