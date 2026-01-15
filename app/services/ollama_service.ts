import env from '#start/env'

export default class OllamaService {
  private static baseUrl = env.get('OLLAMA_URL', 'http://localhost:11434')
  private static model = env.get('OLLAMA_MODEL', 'llama3')

  /**
   * Send a prompt to Ollama and get a response
   */
  public static async generate(prompt: string, systemPrompt?: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          system: systemPrompt,
          stream: false,
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.statusText}`)
      }

      const data = (await response.json()) as any
      return data.response
    } catch (error) {
      console.error('Ollama Generation Error:', error)
      throw error
    }
  }

  /**
   * Generate structured JSON
   */
  public static async generateJson<T>(prompt: string, schema: string): Promise<T> {
    const fullPrompt = `${prompt}\n\nReturn ONLY a valid JSON object matching this structure: ${schema}. No extra text.`
    const response = await this.generate(fullPrompt)

    try {
      // Basic cleanup in case of extra markdown
      const jsonStr = response.replace(/```json/g, '').replace(/```/g, '').trim()
      return JSON.parse(jsonStr) as T
    } catch (e) {
      console.error('JSON Parsing Error:', e, response)
      throw new Error('Failed to parse AI response as JSON')
    }
  }
}
