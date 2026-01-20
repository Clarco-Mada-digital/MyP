import env from '#start/env'

export default class OllamaService {
  private static baseUrl = env.get('OLLAMA_URL') || 'http://127.0.0.1:11434'

  /**
   * List available Ollama models
   */
  static async getModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`)
      if (!response.ok) return []

      const data = (await response.json()) as any
      return data.models?.map((m: any) => m.name) || []
    } catch (error) {
      console.error('Ollama connection failed:', error)
      return []
    }
  }

  /**
   * Generate JSON using Ollama
   */
  static async generateJson(prompt: string, model: string) {
    console.log(`Generating with Ollama model: ${model} (Timeout: 10 min)`)

    const finalPrompt = prompt + '\n\nRespond ONLY with valid JSON.'

    // On crée un contrôleur pour permettre une attente très longue (10 minutes)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 600000) // 10 minutes

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: model,
          prompt: finalPrompt,
          format: 'json',
          stream: false,
          options: {
            temperature: 0.7,
            num_ctx: 4096,
          },
        }),
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`Ollama API Error: ${response.statusText}`)
      }

      const data = (await response.json()) as any

      try {
        return JSON.parse(data.response)
      } catch (e) {
        console.error('Failed to parse Ollama JSON:', data.response)
        throw new Error('Invalid JSON received from Ollama')
      }
    } catch (error) {
      clearTimeout(timeout)
      if (error.name === 'AbortError') {
        throw new Error('Ollama generation timed out after 10 minutes')
      }
      console.error('Ollama Service Error:', error)
      throw error
    }
  }

  /**
   * Generate simple text using Ollama
   */
  static async generateText(prompt: string, model: string) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000) // 2 minutes max for simple text

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: model,
          prompt: prompt,
          stream: false,
          options: { temperature: 0.7 }
        }),
      })

      clearTimeout(timeout)
      if (!response.ok) throw new Error(`Ollama API Error: ${response.statusText}`)

      const data = (await response.json()) as any
      return data.response
    } catch (error) {
      clearTimeout(timeout)
      console.error('Ollama generateText Error:', error)
      throw error
    }
  }
}
