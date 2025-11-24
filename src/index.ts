export interface Env {
  WEATHER_API_KEY: string
  RATE_LIMIT_KV: KVNamespace
}

// 限流配置
const RATE_LIMIT = 10
const RATE_LIMIT_WINDOW = 60

// 获取客户端 IP
function getClientIP(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 'unknown'
}

// 检查并更新请求次数
async function checkRateLimit(ip: string, kv: KVNamespace): Promise<{ allowed: boolean; remaining: number }> {
  const key = `rate_limit:${ip}`
  const now = Math.floor(Date.now() / 1000)
  const windowKey = Math.floor(now / RATE_LIMIT_WINDOW)
  const fullKey = `${key}:${windowKey}`

  const current = await kv.get(fullKey)
  const count = current ? parseInt(current, 10) : 0

  if (count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0 }
  }

  // 更新计数，设置过期时间为窗口时间
  await kv.put(fullKey, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW })

  return { allowed: true, remaining: RATE_LIMIT - count - 1 }
}

export default {
  async fetch(request: Request, env: Env) {
    const startTime = Date.now()
    const ip = getClientIP(request)
    const url = new URL(request.url)

    try {
      console.log(`[请求开始] IP: ${ip}, Path: ${url.pathname}, Query: ${url.search}`)

      // 测试 KV 读取
      const testValue = await env.RATE_LIMIT_KV.get('abc')
      console.log(`[KV测试] key=abc, value=${testValue}`)

      // 检查限流
      const { allowed, remaining } = await checkRateLimit(ip, env.RATE_LIMIT_KV)

      if (!allowed) {
        console.warn(`[限流触发] IP: ${ip} 已被限流`)
        return new Response(JSON.stringify({
          error: '请求过于频繁，请稍后再试',
          retryAfter: RATE_LIMIT_WINDOW
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(RATE_LIMIT_WINDOW),
            'X-RateLimit-Limit': String(RATE_LIMIT),
            'X-RateLimit-Remaining': '0'
          }
        })
      }

      const city = url.searchParams.get('city') || 'Beijing'
      console.log(`[查询天气] 城市: ${city}, 剩余次数: ${remaining}`)

      // OpenWeatherMap API URL
      const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${env.WEATHER_API_KEY}&units=metric&lang=zh_cn`

      const resp = await fetch(apiUrl)
      if (!resp.ok) {
        console.error(`[API错误] 天气API返回: ${resp.status}`)
        return new Response(`Weather API Error: ${resp.status}`, { status: 502 })
      }

      const data = await resp.json()
      const duration = Date.now() - startTime

      console.log(`[请求完成] IP: ${ip}, 城市: ${city}, 耗时: ${duration}ms`)

      // 返回 JSON 给前端
      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(RATE_LIMIT),
          'X-RateLimit-Remaining': String(remaining)
        }
      })
    } catch (err) {
      console.error(`[异常] IP: ${ip}, 错误: ${err}`)
      return new Response(`Internal Error: ${err}`, { status: 500 })
    }
  }
}
