import env from '#start/env'

export default class OpenRouterService {
  private static baseUrl = 'https://openrouter.ai/api/v1'
  private static globalApiKey = env.get('OPENROUTER_API_KEY')

  private static getEffectiveKey(apiKey?: string | null, forcePersonal: boolean = false): string {
    if (apiKey) return apiKey
    if (forcePersonal) throw new Error('Votre clé OpenRouter personnelle est vide.')
    if (!this.globalApiKey) throw new Error('Aucune clé OpenRouter configurée.')
    return this.globalApiKey
  }

  /**
   * List available models from OpenRouter (relevant ones)
   */
  static async getModels(apiKey?: string | null): Promise<string[]> {
    const effectiveKey = apiKey || this.globalApiKey
    if (!effectiveKey) return []

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${effectiveKey}`,
          'HTTP-Referer': 'https://myprofessor.ai',
          'X-Title': 'My Professor'
        }
      })

      if (!response.ok) return []

      const data = await response.json() as any
      return data.data.map((m: any) => m.id) || []
    } catch (error) {
      console.error('OpenRouter connection failed:', error)
      return []
    }
  }

  /**
   * Generate JSON using OpenRouter
   */
  static async generateJson(prompt: string, model: string, apiKey?: string | null, forcePersonal: boolean = false) {
    const effectiveKey = this.getEffectiveKey(apiKey, forcePersonal)

    console.log(`[OpenRouter] Generating JSON with model: ${model} ${apiKey || forcePersonal ? '(Personal Key)' : '(Global Key)'}`)

    const messages = [
      { role: 'system', content: 'You are an educational expert. Respond ONLY with valid JSON.' },
      { role: 'user', content: prompt }
    ]

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${effectiveKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://myprofessor.ai',
          'X-Title': 'My Professor',
          'User-Agent': 'MyProfessor/1.0'
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json() as any
        throw new Error(`OpenRouter Error: ${errorData.error?.message || response.statusText}`)
      }

      const data = await response.json() as any
      let content = data.choices[0].message.content.trim()

      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        content = jsonMatch[0]
      }

      try {
        return JSON.parse(content)
      } catch (e) {
        console.error('Failed to parse OpenRouter JSON (Cleaned):', content)
        throw new Error('Invalid JSON received from OpenRouter')
      }

    } catch (error) {
      console.error('OpenRouter Service Error:', error)
      throw error
    }
  }

  /**
   * Generate text using OpenRouter
   */
  static async generateText(prompt: string, model: string, apiKey?: string | null, forcePersonal: boolean = false) {
    const effectiveKey = this.getEffectiveKey(apiKey, forcePersonal)

    const messages = [
      { role: 'user', content: prompt }
    ]

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${effectiveKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://myprofessor.ai',
          'X-Title': 'My Professor',
          'User-Agent': 'MyProfessor/1.0'
        },
        body: JSON.stringify({
          model: model,
          messages: messages
        }),
      })

      if (!response.ok) {
        const errorData = await response.json() as any
        throw new Error(`OpenRouter Error: ${errorData.error?.message || response.statusText}`)
      }

      const data = await response.json() as any
      return data.choices[0].message.content
    } catch (error) {
      console.error('OpenRouter Service Error:', error)
      throw error
    }
  }
}
