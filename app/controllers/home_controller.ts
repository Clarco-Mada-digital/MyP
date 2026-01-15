import Course from '#models/course'
import type { HttpContext } from '@adonisjs/core/http'

export default class HomeController {
  async index({ view, auth }: HttpContext) {
    await auth.check()
    const courses = await Course.query().where('status', 'ready').orderBy('createdAt', 'desc').limit(6)

    // Attach progress if user is logged in
    if (auth.user) {
      for (const course of courses) {
        const totalLessons = course.content?.modules?.reduce((acc: number, m: any) => acc + (m.lessons?.length || 0), 0) || 0
        const completedCount = await auth.user.related('progress').query()
          .where('courseId', course.id)
          .count('* as total')
          .then(res => res[0].$extras.total || 0)

        const percentage = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0
        course.$extras.progress = percentage
      }
    }

    return view.render('pages/home', { courses })
  }
}