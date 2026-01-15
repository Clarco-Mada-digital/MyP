import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import { registerValidator, loginValidator } from '#validators/auth'

export default class AuthController {
  async registerPage({ view }: HttpContext) {
    return view.render('pages/auth/register')
  }

  async register({ request, response, auth }: HttpContext) {
    const data = await request.validateUsing(registerValidator)
    const user = await User.create(data)

    await auth.use('web').login(user)

    return response.redirect().toPath('/')
  }

  async loginPage({ view }: HttpContext) {
    return view.render('pages/auth/login')
  }

  async login({ request, response, auth, session }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)

    try {
      const user = await User.verifyCredentials(email, password)
      await auth.use('web').login(user)
      return response.redirect().toPath('/')
    } catch (error) {
      session.flash('errors', { login: 'Identifiants invalides' })
      return response.redirect().back()
    }
  }

  async logout({ auth, response }: HttpContext) {
    await auth.use('web').logout()
    return response.redirect().toPath('/')
  }
}