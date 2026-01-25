import env from '#start/env'
import { GoogleGenerativeAI } from '@google/generative-ai'

export default class GeminiService {
  private static globalApiKey = env.get('GEMINI_API_KEY')
  private static globalGenAI = this.globalApiKey ? new GoogleGenerativeAI(this.globalApiKey) : null

  private static getClient(apiKey?: string | null, forcePersonal: boolean = false) {
    // If personal key is provided, always use it
    if (apiKey) {
      return new GoogleGenerativeAI(apiKey)
    }

    // If we are forced to use personal but none provided -> Error
    if (forcePersonal) {
      throw new Error('Votre clé Gemini personnelle est vide. Veuillez la configurer dans les paramètres.')
    }

    // Default to global
    if (!this.globalGenAI) {
      throw new Error('GEMINI_API_KEY is not configured on server and no personal key provided')
    }
    return this.globalGenAI
  }

  static async generateJson(prompt: string, userModel?: string, apiKey?: string | null, forcePersonal: boolean = false) {
    const genAI = this.getClient(apiKey, forcePersonal)
    const modelName = userModel || 'gemini-1.5-flash'

    console.log(`[GeminiService] Generating JSON with model: ${modelName} ${apiKey || forcePersonal ? '(Personal Key)' : '(Global Key)'}`)

    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
      }
    })

    let retries = 0
    const maxRetries = 3

    while (retries < maxRetries) {
      try {
        const result = await model.generateContent(prompt)
        const response = await result.response
        let text = response.text().trim()

        // Nettoyage robuste des balises markdown et extraction du JSON
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          text = jsonMatch[0]
        }

        try {
          return JSON.parse(text)
        } catch (error) {
          console.error(`JSON Parse Error (Attempt ${retries + 1}/${maxRetries}):`, error.message)

          if (retries < maxRetries - 1) {
            retries++
            console.log(`Retrying generation due to JSON error...`)
            continue
          }

          throw new Error('Invalid JSON response from Gemini after multiple attempts')
        }
      } catch (error: any) {
        // Retry on Rate Limit (429)
        if (error.message && error.message.includes('429') && retries < maxRetries - 1) {
          retries++
          let waitTime = retries * 10000
          const match = error.message.match(/retry in ([0-9.]+)s/)
          if (match && match[1]) {
            const seconds = parseFloat(match[1])
            waitTime = Math.ceil(seconds * 1000) + 2000
          }
          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        }
        throw error
      }
    }
  }

  static async generateText(prompt: string, userModel?: string, apiKey?: string | null, forcePersonal: boolean = false) {
    const genAI = this.getClient(apiKey, forcePersonal)
    const modelName = userModel || 'gemini-1.5-flash'
    const model = genAI.getGenerativeModel({ model: modelName })

    try {
      const result = await model.generateContent(prompt)
      const response = await result.response
      return response.text()
    } catch (error) {
      console.error('Gemini generateText error:', error)
      throw error
    }
  }

  static async getModels(apiKey?: string | null): Promise<string[]> {
    const effectiveKey = apiKey || this.globalApiKey
    if (!effectiveKey) return []
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${effectiveKey}`)
      if (!response.ok) return []
      const data = await response.json() as any
      return data.models
        ?.filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => m.name.replace('models/', '')) || []
    } catch (error) {
      console.warn('Failed to fetch Gemini models list:', error)
      return []
    }
  }
}
