import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

const store: RateLimitStore = {}

export default class RateLimitMiddleware {
  private static readonly WINDOW_MS = 15 * 60 * 1000 // 15 minutes
  private static readonly MAX_REQUESTS = 5 // 5 attempts per window

  async handle(ctx: HttpContext, next: NextFn, options: { maxRequests?: number; windowMs?: number } = {}) {
    const maxRequests = options.maxRequests || RateLimitMiddleware.MAX_REQUESTS
    const windowMs = options.windowMs || RateLimitMiddleware.WINDOW_MS

    const key = `rate_limit:${ctx.request.ip()}:${ctx.request.url()}`
    const now = Date.now()

    // Clean expired entries
    if (store[key] && store[key].resetTime < now) {
      delete store[key]
    }

    // Initialize or increment counter
    if (!store[key]) {
      store[key] = {
        count: 1,
        resetTime: now + windowMs
      }
    } else {
      store[key].count++
    }

    // Set rate limit headers
    ctx.response.header('X-RateLimit-Limit', maxRequests)
    ctx.response.header('X-RateLimit-Remaining', Math.max(0, maxRequests - store[key].count))
    ctx.response.header('X-RateLimit-Reset', Math.ceil(store[key].resetTime / 1000))

    // Check if limit exceeded
    if (store[key].count > maxRequests) {
      ctx.response.status(429)
      return ctx.response.json({
        error: 'Trop de tentatives. Veuillez réessayer plus tard.',
        retryAfter: Math.ceil((store[key].resetTime - now) / 1000)
      })
    }

    await next()
  }
}
