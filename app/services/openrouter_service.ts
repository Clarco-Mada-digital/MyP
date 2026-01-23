import env from '#start/env'

export default class OpenRouterService {
  private static baseUrl = 'https://openrouter.ai/api/v1'
  private static apiKey = env.get('OPENROUTER_API_KEY')

  /**
   * List available models from OpenRouter (relevant ones)
   */
  static async getModels(): Promise<string[]> {
    if (!this.apiKey) return []

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://myprofessor.ai',
          'X-Title': 'My Professor'
        }
      })

      if (!response.ok) return []

      const data = await response.json() as any
      // Ne garder que les modèles gratuits (:free)
      return data.data
        // ?.filter((m: any) => m.id.endsWith(':free'))
        .map((m: any) => m.id) || []
    } catch (error) {
      console.error('OpenRouter connection failed:', error)
      return []
    }
  }

  /**
   * Generate JSON using OpenRouter
   */
  static async generateJson(prompt: string, model: string) {
    if (!this.apiKey) throw new Error('OpenRouter API Key is missing')

    console.log(`[OpenRouter] Generating JSON with model: ${model}`)

    const messages = [
      { role: 'system', content: 'You are an educational expert. Respond ONLY with valid JSON.' },
      { role: 'user', content: prompt }
    ]

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://myprofessor.ai',
          'X-Title': 'My Professor',
          'User-Agent': 'MyProfessor/1.0'
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          // Certains modèles gratuits plantent avec response_format: 'json_object'
          // On se fie au system prompt qui est déjà très clair.
          // response_format: { type: 'json_object' }
        }),
      })

      if (!response.ok) {
        const errorData = await response.json() as any
        throw new Error(`OpenRouter Error: ${errorData.error?.message || response.statusText}`)
      }

      const data = await response.json() as any
      let content = data.choices[0].message.content.trim()

      // Nettoyage robuste : Extraire le contenu entre { et } si l'IA a ajouté du texte
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
  static async generateText(prompt: string, model: string) {
    if (!this.apiKey) throw new Error('OpenRouter API Key is missing')

    const messages = [
      { role: 'user', content: prompt }
    ]

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
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
