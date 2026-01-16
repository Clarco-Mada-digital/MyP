export default class OllamaService {
  private static baseUrl = 'http://127.0.0.1:11434'

  /**
   * List available Ollama models
   */
  static async getModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`)
      if (!response.ok) return []

      const data = await response.json() as any
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
    console.log(`Generating with Ollama model: ${model}`)

    // Ensure the prompt explicitly asks for JSON if not already (Ollama's format: 'json' enforces syntax but valid JSON structure instructions help)
    const finalPrompt = prompt + "\n\nRespond ONLY with valid JSON."

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          prompt: finalPrompt,
          format: 'json',
          stream: false,
          options: {
            temperature: 0.7,
            num_ctx: 4096 // Increase context window for long courses
          }
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama API Error: ${response.statusText}`)
      }

      const data = await response.json() as any
      // Ollama returns { response: "stringified json", ... }

      try {
        return JSON.parse(data.response)
      } catch (e) {
        console.error('Failed to parse Ollama JSON:', data.response)
        throw new Error('Invalid JSON received from Ollama')
      }

    } catch (error) {
      console.error('Ollama Service Error:', error)
      throw error
    }
  }
}
