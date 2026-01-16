import env from '#start/env'
import { GoogleGenerativeAI } from '@google/generative-ai'

export default class GeminiService {
  private static apiKey = env.get('GEMINI_API_KEY')
  private static genAI = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null

  static async generateJson(prompt: string, userModel?: string) {
    if (!this.genAI) {
      throw new Error('GEMINI_API_KEY is not configured')
    }

    const modelName = userModel || 'gemini-2.0-flash-lite'
    const model = this.genAI.getGenerativeModel({
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

        // Nettoyage robuste des balises markdown
        text = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()

        try {
          return JSON.parse(text)
        } catch (error) {
          const fs = await import('node:fs')
          fs.writeFileSync('raw_gemini_response.txt', text)
          console.error('Failed to parse Gemini response as JSON:', text)
          throw new Error('Invalid JSON response from Gemini')
        }
      } catch (error) {
        if (error.message && error.message.includes('429') && retries < maxRetries - 1) {
          retries++

          let waitTime = retries * 10000 // Default: 10s, 20s, 30s...

          // Try to extract exact wait time from error message
          // Example: "Please retry in 15.751173827s."
          const match = error.message.match(/retry in ([0-9.]+)s/)
          if (match && match[1]) {
            const seconds = parseFloat(match[1])
            waitTime = Math.ceil(seconds * 1000) + 2000 // Add 2s buffer
            console.log(`Gemini asked to wait ${seconds}s. Waiting ${waitTime / 1000}s...`)
          } else {
            console.log(`Gemini Rate Limit hit. Retrying in ${waitTime / 1000} seconds...`)
          }

          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        }
        throw error
      }
    }
  }

  static async getModels(): Promise<string[]> {
    if (!this.apiKey) return []
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`)
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
