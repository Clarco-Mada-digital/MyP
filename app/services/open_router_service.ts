import env from '#start/env'

export default class OpenRouterService {
  private static apiKey = env.get('OPENROUTER_API_KEY')

  static async generateJson(prompt: string, userModel?: string) {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured')
    }

    const modelName = userModel || 'google/gemini-2.0-flash-lite:free'
    console.log(`[OpenRouterService] Using model: ${modelName}`)

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://my-professor.app', // Optional for OpenRouter
          'X-Title': 'My Professor',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' }
        })
      })

      if (!response.ok) {
        const errorData = await response.json() as any
        throw new Error(`OpenRouter Error: ${errorData.error?.message || response.statusText}`)
      }

      const data = await response.json() as any
      const text = data.choices[0].message.content.trim()

      return JSON.parse(text)
    } catch (error) {
      console.error('OpenRouter generateJson error:', error)
      throw error
    }
  }

  static async getModels(): Promise<string[]> {
    if (!this.apiKey) return []
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models')
      if (!response.ok) return []
      const data = await response.json() as any
      // Return a list of popular free and efficient models
      return data.data
        ?.map((m: any) => m.id)
        .filter((id: string) =>
          id.includes('free') ||
          id.includes('flash') ||
          id.includes('llama-3') ||
          id.includes('mistral-7b')
        ) || []
    } catch (error) {
      console.warn('Failed to fetch OpenRouter models:', error)
      return []
    }
  }
}
