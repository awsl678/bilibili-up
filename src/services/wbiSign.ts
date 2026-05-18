import md5 from 'blueimp-md5'
interface WbiKeys { img_key: string; sub_key: string }
let cachedKeys: WbiKeys | null = null
let lastFetchTime = 0
const mixinKeyEncTab = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52]
async function getWbiKeys(): Promise<WbiKeys> {
  const now = Date.now()
  if (cachedKeys && now - lastFetchTime < 10*60*1000) return cachedKeys
  const res = await window.electronAPI!.request('https://api.bilibili.com/x/web-interface/nav', { useAuth: false })
  if (res.error) throw new Error(res.error)
  const wbi_img = res.data.data?.wbi_img
  if (!wbi_img) throw new Error('Failed to get wbi keys')
  const img_key = wbi_img.img_url.substring(wbi_img.img_url.lastIndexOf('/')+1).split('.')[0]
  const sub_key = wbi_img.sub_url.substring(wbi_img.sub_url.lastIndexOf('/')+1).split('.')[0]
  cachedKeys = { img_key, sub_key }
  lastFetchTime = now
  return cachedKeys
}
function getMixinKey(origin: string) { let t=''; for(let i of mixinKeyEncTab) t+=origin[i]; return t.slice(0,32) }
export async function wbiSign(params: Record<string,any>) {
  const { img_key, sub_key } = await getWbiKeys()
  const mixin_key = getMixinKey(img_key+sub_key)
  params.wts = Math.floor(Date.now()/1000)
  const sorted = Object.keys(params).sort()
  const qs = sorted.map(k=>`${k}=${encodeURIComponent(params[k])}`).join('&')
  const sign = md5(qs+mixin_key)
  return { ...params, w_rid: sign }
}