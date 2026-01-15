import env from '#start/env'
import { GoogleGenerativeAI } from '@google/generative-ai'

export default class GeminiService {
  private static apiKey = env.get('GEMINI_API_KEY')
  private static genAI = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null

  static async generateJson(prompt: string) {
    if (!this.genAI) {
      throw new Error('GEMINI_API_KEY is not configured')
    }

    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-lite',
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
          console.log(`Gemini Rate Limit hit. Retrying in ${retries * 10} seconds...`)
          await new Promise(resolve => setTimeout(resolve, retries * 10000))
          continue
        }
        throw error
      }
    }
  }
}
