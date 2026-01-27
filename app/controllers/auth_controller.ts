import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import { getAuthValidator, formatValidationErrors } from '#validators/custom_messages'
import vine from '@vinejs/vine'

export default class AuthController {
  async registerPage({ view }: HttpContext) {
    return view.render('pages/auth/register')
  }

  async register({ request, response, auth, session }: HttpContext) {
    try {
      const data = await request.validateUsing(getAuthValidator())

      // Check if it's the first user
      const usersCount = await User.query().count('* as total').then(r => r[0].$extras.total)
      const isAdmin = usersCount === 0

      const user = await User.create({ ...data, isAdmin })

      await auth.use('web').login(user)

      return response.redirect().toPath('/')
    } catch (error) {
      // Gérer les erreurs de validation avec des messages clairs
      if (error.messages) {
        const formattedErrors = formatValidationErrors(error.messages)
        session.flash('errors', formattedErrors)
      } else {
        session.flash('errors', { 
          general: 'Une erreur est survenue lors de l\'inscription. Veuillez réessayer.' 
        })
      }
      return response.redirect().back()
    }
  }

  async loginPage({ view }: HttpContext) {
    return view.render('pages/auth/login')
  }

  async login({ request, response, auth, session }: HttpContext) {
    try {
      const { email, password } = await request.validateUsing(vine.compile(
        vine.object({
          email: vine.string().email().normalizeEmail(),
          password: vine.string(),
        })
      ))

      const user = await User.verifyCredentials(email, password)
      await auth.use('web').login(user)
      return response.redirect().toPath('/')
    } catch (error) {
      if (error.messages) {
        const formattedErrors = formatValidationErrors(error.messages)
        session.flash('errors', formattedErrors)
      } else {
        session.flash('errors', { login: 'Identifiants invalides' })
      }
      return response.redirect().back()
    }
  }

  async logout({ auth, response }: HttpContext) {
    await auth.use('web').logout()
    return response.redirect().toPath('/')
  }
}