import User from '#models/user'
import GeminiService from '#services/gemini_service'
import OllamaService from '#services/ollama_service'
import OpenRouterService from '#services/openrouter_service'
import ApplicationSetting from '#models/application_setting'

export default class AiProviderService {
  /**
   * 1. Résout le moteur à utiliser
   */
  static async resolveProvider(user: User): Promise<string> {
    // Si l'utilisateur a choisi Ollama, c'est prioritaire et indépendant des clés cloud
    if (user.aiProvider === 'ollama') return 'ollama'

    // Si l'utilisateur veut utiliser ses propres clés cloud
    if (user.useCustomKeys) {
      if (user.aiProvider === 'openrouter' || user.aiProvider === 'gemini') {
        return user.aiProvider
      }
      // Si l'option est ON mais qu'il n'a rien choisi de spécifique, on prend le défaut admin 
      // mais attention: le generateJson échouera s'il n'a pas mis sa clé (voir plus bas)
      return await ApplicationSetting.getValue('active_cloud_provider', 'gemini')
    }

    // Par défaut : Mode Standard Admin
    return await ApplicationSetting.getValue('active_cloud_provider', 'gemini')
  }

  /**
   * 2. Génération de contenu JSON
   */
  static async generateJson(prompt: string, user: User) {
    const provider = await this.resolveProvider(user)

    if (provider === 'ollama') {
      return OllamaService.generateJson(prompt, user.aiModel || 'llama3')
    }

    // MODE PERSONNEL (Strict)
    if (user.useCustomKeys) {
      if (provider === 'openrouter') {
        if (!user.customOpenrouterKey) throw new Error("Clé OpenRouter personnelle manquante.")
        return OpenRouterService.generateJson(prompt, user.aiModel || 'google/gemini-2.0-flash-lite:free', user.customOpenrouterKey, true)
      } else {
        if (!user.customGeminiKey) throw new Error("Clé Gemini personnelle manquante.")
        return GeminiService.generateJson(prompt, user.aiModel || 'gemini-1.5-flash', user.customGeminiKey, true)
      }
    }

    // MODE STANDARD (Admin keys)
    if (provider === 'openrouter') {
      return OpenRouterService.generateJson(prompt, user.aiModel || 'google/gemini-2.0-flash-lite:free')
    }
    return GeminiService.generateJson(prompt, user.aiModel || 'gemini-1.5-flash')
  }

  /**
   * 3. Génération de texte brut
   */
  static async generateText(prompt: string, user: User) {
    const provider = await this.resolveProvider(user)

    if (provider === 'ollama') {
      return OllamaService.generateText(prompt, user.aiModel || 'llama3')
    }

    // MODE PERSONNEL (Strict)
    if (user.useCustomKeys) {
      if (provider === 'openrouter') {
        if (!user.customOpenrouterKey) throw new Error("Clé OpenRouter personnelle manquante.")
        return OpenRouterService.generateText(prompt, user.aiModel || 'google/gemini-2.0-flash-lite:free', user.customOpenrouterKey, true)
      } else {
        if (!user.customGeminiKey) throw new Error("Clé Gemini personnelle manquante.")
        return GeminiService.generateText(prompt, user.aiModel || 'gemini-1.5-flash', user.customGeminiKey, true)
      }
    }

    // MODE STANDARD (Admin keys)
    if (provider === 'openrouter') {
      return OpenRouterService.generateText(prompt, user.aiModel || 'google/gemini-2.0-flash-lite:free')
    }
    return GeminiService.generateText(prompt, user.aiModel || 'gemini-1.5-flash')
  }

  /**
   * 3. Récupération des modèles pour l'interface
   */
  static async getCloudModels(provider: string, user?: User): Promise<string[]> {
    const usePersonal = user?.useCustomKeys || false

    if (provider === 'openrouter') {
      const key = usePersonal ? user?.customOpenrouterKey : null
      return OpenRouterService.getModels(key)
    } else {
      const key = usePersonal ? user?.customGeminiKey : null
      return GeminiService.getModels(key)
    }
  }

  /**
   * Récupère le nom du moteur par défaut configuré par l'admin
   */
  static async getSystemDefaultProvider(): Promise<string> {
    return await ApplicationSetting.getValue('active_cloud_provider', 'gemini')
  }
}
