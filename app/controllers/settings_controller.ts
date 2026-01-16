import type { HttpContext } from '@adonisjs/core/http'
import OllamaService from '#services/ollama_service'
import GeminiService from '#services/gemini_service'
import User from '#models/user'

export default class SettingsController {

  async index({ view, auth }: HttpContext) {
    await auth.check()
    const user = auth.user! as User

    // Fetch Ollama models
    const ollamaModels = await OllamaService.getModels()

    // Fetch Gemini models (Dynamic with Fallback)
    let geminiModels: string[] = []
    try {
      geminiModels = await GeminiService.getModels()
    } catch (e) {
      console.warn('Could not fetch Gemini models dynamically', e)
    }

    // Fallback if API fails (e.g. Rate Limit 429)
    if (geminiModels.length === 0) {
      geminiModels = [
        'gemini-2.0-flash-lite',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-pro'
      ]
    }

    return view.render('pages/settings/index', {
      user,
      ollamaModels,
      geminiModels,
      ollamaConnected: ollamaModels.length > 0
    })
  }

  async update({ request, response, auth, session }: HttpContext) {
    const user = auth.user! as User
    const provider = request.input('ai_provider')
    const model = request.input('ai_model')

    if (!['gemini', 'ollama'].includes(provider)) {
      session.flash('notification', { type: 'error', message: 'Fournisseur invalide' })
      return response.redirect().back()
    }

    user.aiProvider = provider
    user.aiModel = model
    await user.save()

    session.flash('notification', { type: 'success', message: 'Paramètres mis à jour avec succès !' })
    return response.redirect().back()
  }
}
