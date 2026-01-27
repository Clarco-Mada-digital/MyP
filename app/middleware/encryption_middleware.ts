import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import encryption from '@adonisjs/core/services/encryption'

export default class EncryptionMiddleware {
  // Encrypt API keys before storing
  static encryptApiKey(apiKey: string): string {
    return encryption.encrypt(apiKey)
  }

  // Decrypt API keys when needed
  static decryptApiKey(encryptedKey: string | null): string | null {
    if (!encryptedKey) return null
    return encryption.decrypt(encryptedKey)
  }

  // Middleware to automatically encrypt sensitive fields
  async handle(ctx: HttpContext, next: NextFn) {
    // Intercept requests that contain sensitive data
    if (ctx.request.url().includes('/settings') && ctx.request.method() === 'POST') {
      const body = ctx.request.all()
      
      // Encrypt API keys before processing
      if (body.custom_gemini_key) {
        body.custom_gemini_key = EncryptionMiddleware.encryptApiKey(body.custom_gemini_key)
      }
      
      if (body.custom_openrouter_key) {
        body.custom_openrouter_key = EncryptionMiddleware.encryptApiKey(body.custom_openrouter_key)
      }
      
      // Replace request body
      ctx.request.updateBody(body)
    }

    await next()
  }
}
