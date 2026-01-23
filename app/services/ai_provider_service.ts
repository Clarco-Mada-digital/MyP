import User from '#models/user'
import GeminiService from '#services/gemini_service'
import OllamaService from '#services/ollama_service'
import OpenRouterService from '#services/open_router_service'
import ApplicationSetting from '#models/application_setting'

export default class AiProviderService {
  /**
   * Generates JSON content using the appropriate AI provider.
   * Logic:
   * 1. If user chose 'ollama', use local Ollama.
   * 2. Else, use the GLOBAL_CLOUD_PROVIDER setting (admin chosen).
   */
  static async generateJson(prompt: string, user: User) {
    if (user.aiProvider === 'ollama') {
      return OllamaService.generateJson(prompt, user.aiModel || 'llama3')
    }

    // Determine which cloud provider is active globally
    const cloudProvider = await ApplicationSetting.getValue('active_cloud_provider', 'gemini')

    switch (cloudProvider) {
      case 'openrouter':
        return OpenRouterService.generateJson(prompt, user.aiModel || 'google/gemini-2.0-flash-lite:free')
      case 'gemini':
      default:
        return GeminiService.generateJson(prompt, user.aiModel || 'gemini-flash-latest')
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
