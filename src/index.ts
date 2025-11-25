export interface Env {
  WEATHER_API_KEY: string | { get(): Promise<string> }
  // RATE_LIMIT_KV: KVNamespace
}

// 限流配置
const RATE_LIMIT = 30
const RATE_LIMIT_WINDOW = 60

// 获取客户端 IP
function getClientIP(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 'unknown'
}

// 检查并更新请求次数（当前已禁用）
// async function checkRateLimit(ip: string, kv: KVNamespace): Promise<{ allowed: boolean; remaining: number }> {
//   const key = `rate_limit:${ip}`
//   const now = Math.floor(Date.now() / 1000)
//   const windowKey = Math.floor(now / RATE_LIMIT_WINDOW)
//   const fullKey = `${key}:${windowKey}`

//   const current = await kv.get(fullKey)
//   const count = current ? parseInt(current, 10) : 0

//   if (count >= RATE_LIMIT) {
//     return { allowed: false, remaining: 0 }
//   }

//   // 更新计数，设置过期时间为窗口时间
//   await kv.put(fullKey, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW })

//   return { allowed: true, remaining: RATE_LIMIT - count - 1 }
// }

// CORS 头部配置
function getCorsHeaders(origin: string | null): Record<string, string> {
  // 允许的源列表（包括本地开发环境）
  const allowedOrigins = [
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:8080',
    'http://localhost:8080'
  ]

  // 检查请求来源是否在允许列表中，如果没有匹配则使用通配符（开发环境）
  const allowedOrigin = origin && allowedOrigins.includes(origin) ? origin : '*'

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const startTime = Date.now()
    const ip = getClientIP(request)
    const url = new URL(request.url)
    const origin = request.headers.get('Origin')

    // 处理 OPTIONS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(origin)
      })
    }

    // 只处理根路径，其他路径返回 404
    if (url.pathname !== '/') {
      console.log(`[404] 路径不存在: ${url.pathname}`)
      return new Response(JSON.stringify({
        error: 'Not Found',
        message: `路径 ${url.pathname} 不存在`
      }), {
        status: 404,
        headers: {
          ...getCorsHeaders(origin),
          'Content-Type': 'application/json'
        }
      })
    }

    try {
      console.log(`[请求开始] IP: ${ip}, Path: ${url.pathname}, Query: ${url.search}`)

      // 从 Secrets Store 获取 API Key
      let apiKey: string
      try {
        // 检查 env.WEATHER_API_KEY 是否存在
        if (!env.WEATHER_API_KEY) {
          console.error('[配置错误] env.WEATHER_API_KEY 未定义')
          console.error('[诊断] env 对象键:', Object.keys(env))
          return new Response(JSON.stringify({
            error: '服务器配置错误：Secrets Store 绑定未配置',
            hint: '请在 Cloudflare Dashboard 中配置 Secrets Store 绑定，或检查 wrangler.jsonc 配置'
          }), {
            status: 500,
            headers: {
              ...getCorsHeaders(origin),
              'Content-Type': 'application/json'
            }
          })
        }

        // 检查是否有 get 方法
        if (typeof env.WEATHER_API_KEY === 'string') {
          // 如果直接是字符串，直接使用
          apiKey = env.WEATHER_API_KEY
        } else if (typeof env.WEATHER_API_KEY === 'object' && env.WEATHER_API_KEY !== null && 'get' in env.WEATHER_API_KEY && typeof env.WEATHER_API_KEY.get === 'function') {
          // 使用 get() 方法获取（Secrets Store 绑定）
          apiKey = await env.WEATHER_API_KEY.get()
        } else {
          console.error('[配置错误] env.WEATHER_API_KEY 类型不正确:', typeof env.WEATHER_API_KEY)
          return new Response(JSON.stringify({
            error: '服务器配置错误：Secrets Store 绑定类型不正确',
            type: typeof env.WEATHER_API_KEY
          }), {
            status: 500,
            headers: {
              ...getCorsHeaders(origin),
              'Content-Type': 'application/json'
            }
          })
        }

        if (!apiKey) {
          console.error('[配置错误] WEATHER_API_KEY 为空')
          return new Response(JSON.stringify({
            error: '服务器配置错误：API Key 为空'
          }), {
            status: 500,
            headers: {
              ...getCorsHeaders(origin),
              'Content-Type': 'application/json'
            }
          })
        }
      } catch (err) {
        console.error('[配置错误] 无法获取 WEATHER_API_KEY:', err)
        return new Response(JSON.stringify({
          error: '服务器配置错误：无法获取 API Key',
          message: err instanceof Error ? err.message : String(err)
        }), {
          status: 500,
          headers: {
            ...getCorsHeaders(origin),
            'Content-Type': 'application/json'
          }
        })
      }

      // 测试 KV 读取
      // const testValue = await env.RATE_LIMIT_KV.get('abc')
      // console.log(`[KV测试] key=abc, value=${testValue}`)

      // 检查限流
      // const { allowed, remaining } = await checkRateLimit(ip, env.RATE_LIMIT_KV)
      const allowed = true
      const remaining = 100
      if (!allowed) {
        console.warn(`[限流触发] IP: ${ip} 已被限流`)
        const corsHeaders = getCorsHeaders(origin)
        return new Response(JSON.stringify({
          error: '请求过于频繁，请稍后再试',
          retryAfter: RATE_LIMIT_WINDOW
        }), {
          status: 429,
          headers: {
            ...corsHeaders,
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
      const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=zh_cn`

      const resp = await fetch(apiUrl)
      if (!resp.ok) {
        console.error(`[API错误] 天气API返回: ${resp.status}`)
        return new Response(JSON.stringify({
          error: '天气API请求失败',
          status: resp.status
        }), {
          status: 502,
          headers: {
            ...getCorsHeaders(origin),
            'Content-Type': 'application/json'
          }
        })
      }

      const data = await resp.json()
      const duration = Date.now() - startTime

      console.log(`[请求完成] IP: ${ip}, 城市: ${city}, 耗时: ${duration}ms`)

      // 返回 JSON 给前端
      const corsHeaders = getCorsHeaders(origin)
      return new Response(JSON.stringify(data), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(RATE_LIMIT),
          'X-RateLimit-Remaining': String(remaining)
        }
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error(`[异常] IP: ${ip}, 错误: ${errorMessage}`)
      return new Response(JSON.stringify({
        error: '服务器内部错误',
        message: errorMessage
      }), {
        status: 500,
        headers: {
          ...getCorsHeaders(origin),
          'Content-Type': 'application/json'
        }
      })
    }
  }
}
