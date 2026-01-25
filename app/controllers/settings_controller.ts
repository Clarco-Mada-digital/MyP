import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import hash from '@adonisjs/core/services/hash'
import AiProviderService from '#services/ai_provider_service'

export default class SettingsController {

  async index({ view, auth }: HttpContext) {
    await auth.check()
    const user = auth.user! as User

    const systemDefaultProvider = await AiProviderService.getSystemDefaultProvider()

    // On récupère les modèles pour le mode actuel de l'utilisateur
    let cloudModels: string[] = []

    try {
      if (user.aiProvider === 'ollama') {
        cloudModels = [] // Géré en JS côté client pour Ollama
      } else if (user.useCustomKeys && (user.aiProvider === 'gemini' || user.aiProvider === 'openrouter')) {
        // Mode personnel : on utilise sa clé
        cloudModels = await AiProviderService.getCloudModels(user.aiProvider, user)
      } else {
        // Mode standard : on utilise la config serveur
        cloudModels = await AiProviderService.getCloudModels(systemDefaultProvider)
      }
    } catch (e) {
      console.warn('Erreur lors de la récupération des modèles cloud', e)
    }

    // Fallbacks statiques si l'API échoue
    if (cloudModels.length === 0 && user.aiProvider !== 'ollama') {
      cloudModels = systemDefaultProvider === 'openrouter'
        ? ['google/gemini-2.0-flash-lite:free', 'mistralai/mistral-7b-instruct:free']
        : ['gemini-1.5-flash', 'gemini-1.5-pro']
    }

    return view.render('pages/settings/index', {
      user,
      systemDefaultProvider,
      cloudModels
    })
  }

  async update({ request, response, auth, session }: HttpContext) {
    const user = auth.user! as User
    const provider = request.input('ai_provider') // 'default' (standard), 'gemini', 'openrouter', 'ollama'
    const model = request.input('ai_model')
    const useCustomKeys = request.input('use_custom_keys') === 'on'
    const customGeminiKey = request.input('custom_gemini_key')
    const customOpenrouterKey = request.input('custom_openrouter_key')

    // Validation
    if (!['gemini', 'ollama', 'openrouter', 'default'].includes(provider)) {
      session.flash('notification', { type: 'error', message: 'Fournisseur invalide' })
      return response.redirect().back()
    }

    user.aiProvider = provider
    user.aiModel = model
    user.useCustomKeys = useCustomKeys
    user.customGeminiKey = customGeminiKey
    user.customOpenrouterKey = customOpenrouterKey

    await user.save()

    session.flash('notification', { type: 'success', message: 'Paramètres mis à jour !' })
    return response.redirect().back()
  }

  async testKey({ request, response }: HttpContext) {
    const provider = request.input('provider')
    const key = request.input('key')
    if (!key) return response.badRequest({ message: 'Clé manquante' })

    try {
      const mockUser = { useCustomKeys: true, customGeminiKey: key, customOpenrouterKey: key } as User
      const models = await AiProviderService.getCloudModels(provider, mockUser)

      return response.ok({
        message: 'Connexion réussie !',
        models: models
      })
    } catch (e) {
      return response.badRequest({ message: e.message || 'Erreur de connexion' })
    }
  }

  // ... (Autres méthodes updateProfile, updatePassword inchangées)
  async updateProfile({ request, response, auth, session }: HttpContext) {
    const user = auth.user! as User
    const fullName = request.input('fullName')
    if (!fullName || fullName.trim().length < 2) {
      session.flash('notification', { type: 'error', message: 'Le nom doit contenir au moins 2 caractères.' })
      return response.redirect().back()
    }
    user.fullName = fullName
    await user.save()
    session.flash('notification', { type: 'success', message: 'Profil mis à jour !' })
    return response.redirect().back()
  }

  async updatePassword({ request, response, auth, session }: HttpContext) {
    const user = auth.user! as User
    const { current_password, new_password, new_password_confirmation } = request.all()
    const isValid = await hash.verify(user.password, current_password)
    if (!isValid) {
      session.flash('notification', { type: 'error', message: 'Mot de passe actuel incorrect.' })
      return response.redirect().back()
    }
    if (new_password.length < 8) {
      session.flash('notification', { type: 'error', message: 'Le nouveau mot de passe doit faire au moins 8 caractères.' })
      return response.redirect().back()
    }
    if (new_password !== new_password_confirmation) {
      session.flash('notification', { type: 'error', message: 'Les nouveaux mots de passe ne correspondent pas.' })
      return response.redirect().back()
    }
    user.password = new_password
    await user.save()
    session.flash('notification', { type: 'success', message: 'Mot de passe modifié !' })
    return response.redirect().back()
  }
}
