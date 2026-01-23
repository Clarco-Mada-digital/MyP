import User from '#models/user'
import GeminiService from '#services/gemini_service'
import OllamaService from '#services/ollama_service'
import OpenRouterService from '#services/openrouter_service'
import ApplicationSetting from '#models/application_setting'

export default class AiProviderService {
  /**
   * Generates JSON content using the appropriate AI provider.
   */
  static async generateJson(prompt: string, user: User) {
    if (user.aiProvider === 'ollama') {
      return OllamaService.generateJson(prompt, user.aiModel || 'llama3')
    }

    const cloudProvider = await ApplicationSetting.getValue('active_cloud_provider', 'gemini')

    switch (cloudProvider) {
      case 'openrouter':
        return OpenRouterService.generateJson(prompt, user.aiModel || 'google/gemini-2.0-flash-lite:free')
      case 'gemini':
      default:
        return GeminiService.generateJson(prompt, user.aiModel || 'gemini-1.5-flash')
    }
  }

  /**
   * Generates PLAIN TEXT content using the appropriate AI provider.
   */
  static async generateText(prompt: string, user: User) {
    if (user.aiProvider === 'ollama') {
      return OllamaService.generateText(prompt, user.aiModel || 'llama3')
    }

    const cloudProvider = await ApplicationSetting.getValue('active_cloud_provider', 'gemini')

    switch (cloudProvider) {
      case 'openrouter':
        // Reuse generateJson but we might need a specific text method. 
        // For now, OpenRouter generateJson returns the raw content parsed as JSON.
        // Let's add generateText to services.
        return OpenRouterService.generateText(prompt, user.aiModel || 'google/gemini-2.0-flash-lite:free')
      case 'gemini':
      default:
        return GeminiService.generateText(prompt, user.aiModel || 'gemini-1.5-flash')
    }
  }

  /**
   * Gets the list of models for the active cloud provider
   */
  static async getActiveCloudModels(): Promise<string[]> {
    const cloudProvider = await ApplicationSetting.getValue('active_cloud_provider', 'gemini')

    switch (cloudProvider) {
      case 'openrouter':
        return OpenRouterService.getModels()
      case 'gemini':
      default:
        return GeminiService.getModels()
    }
  }

  static async getActiveProviderName(): Promise<string> {
    return await ApplicationSetting.getValue('active_cloud_provider', 'gemini')
  }
}
