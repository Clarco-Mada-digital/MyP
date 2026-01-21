import type { HttpContext } from '@adonisjs/core/http'
import GeminiService from '#services/gemini_service'
import User from '#models/user'

import hash from '@adonisjs/core/services/hash'

export default class SettingsController {

  async index({ view, auth }: HttpContext) {
    await auth.check()
    const user = auth.user! as User

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
        'gemini-flash-latest',
        'gemini-flash-lite-latest',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-2.5-flash',
      ]
    }

    return view.render('pages/settings/index', {
      user,
      geminiModels,
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

    session.flash('notification', { type: 'success', message: 'Paramètres IA mis à jour avec succès !' })
    return response.redirect().back()
  }

  async updateProfile({ request, response, auth, session }: HttpContext) {
    const user = auth.user! as User
    const fullName = request.input('fullName')

    if (!fullName || fullName.trim().length < 2) {
      session.flash('notification', { type: 'error', message: 'Le nom doit contenir au moins 2 caractères.' })
      return response.redirect().back()
    }

    user.fullName = fullName
    await user.save()

    session.flash('notification', { type: 'success', message: 'Profil mis à jour avec succès !' })
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

    session.flash('notification', { type: 'success', message: 'Mot de passe modifié avec succès !' })
    return response.redirect().back()
  }
}
