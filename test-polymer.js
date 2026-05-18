const https = require('https')

// 1. 粘贴完整 Cookie（从浏览器复制，格式为 "name1=value1; name2=value2; ..."）
const COOKIE = `buvid3=4E979CE4-39B0-6D80-3623-CDED27F9F07970638infoc; buvid4=AC0F75F6-1F74-47D3-482D-6E0BEEA459DG70673-026051414-LqQlI/MpaTbYKWTUOicaPg%3D%3D; buvid_fp=f00d3ff3793a4836fab3cd7652c86ee9; SESSDATA=a447dc37%2C1794293247%2C0887e%2A51CjA08cD9YJ9x3cnsJ6biDtFi5mexmtBOeuA0XzoqjpIe35ieDLQnAzG-8v1OUWgMlV0SVk9GdWVZeXd5VDU3dzlyRG5Ya3NLZGR1MFVqdWR3dUIyN29TVjZOWWlXSmd5YzRIUklvSWxXeWR3MXZCT0gyT1k3Z2xXNS1rc3BmalliMjEwLXIyM3JnIIEC; bili_jct=e297a88e0a2b4ad9f5933fc45829fe38; DedeUserID=108064287; DedeUserID__ckMd5=532020f97dca1375; sid=ekqim5nv; bili_ticket=eyJhbGciOiJIUzI1NiIsImtpZCI6InMwMyIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3Nzg5OTk4NzEsImlhdCI6MTc3ODc0MDYxMSwicGx0IjotMX0.BsLcoS5xSr13pzMeaYKHnA9D6FT-wUUnWFftDeQOiaU; bili_ticket_expires=1778999811; b_nut=1778740670; _uuid=5C101161A-105610-67E1-FD95-677618BAA10E747941infoc; b_lsid=7D9DE1AE_19E253D83D3; __at_once=5241150798204181265; theme-tip-show=SHOWED`

// 2. 要测试的 UP 主 mid（可替换）
const MID = '1736485735'

// 3. 请求选项
const url = `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=${MID}&platform=web&web_location=333.1387`

const options = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    'Referer': 'https://space.bilibili.com/',
    'Origin': 'https://space.bilibili.com',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'sec-ch-ua': '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Cookie': COOKIE,
  }
}

https.get(url, options, (res) => {
  let data = ''
  res.on('data', chunk => data += chunk)
  res.on('end', () => {
    console.log('状态码:', res.statusCode)
    try {
      const json = JSON.parse(data)
      console.log('响应 code:', json.code, 'message:', json.message)
      if (json.code === 0) {
        const items = json.data?.items || []
        console.log(`✅ 成功获取 ${items.length} 条动态`)
        items.slice(0, 2).forEach((item, i) => {
          console.log(`--- 动态 ${i+1} ---`)
          console.log('ID:', item.id_str)
          console.log('内容摘要:', item.modules?.module_dynamic?.desc?.text?.substring(0, 80))
        })
      } else {
        console.log('❌ 请求未成功，code:', json.code, 'message:', json.message)
      }
    } catch (e) {
      console.log('响应不是 JSON:', data.substring(0, 300))
    }
  })
}).on('error', (err) => console.error('请求错误:', err))