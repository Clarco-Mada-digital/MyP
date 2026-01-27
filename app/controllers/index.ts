import type { HttpContext } from '@adonisjs/core/http'

export default class IndexController {
  async index({ view }: HttpContext) {
    return view.render('pages/social/index')
  }
}
