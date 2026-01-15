import type { HttpContext } from '@adonisjs/core/http'
import CourseProgress from '#models/course_progress'
import User from '#models/user'

export default class ProgressesController {
  async toggle({ request, response, auth }: HttpContext) {
    const user = auth.user as User
    const { courseId, moduleTitle, lessonTitle } = request.only(['courseId', 'moduleTitle', 'lessonTitle'])

    const existingProgress = await CourseProgress.query()
      .where('userId', user.id)
      .where('courseId', courseId)
      .where('moduleTitle', moduleTitle)
      .where('lessonTitle', lessonTitle)
      .first()

    if (existingProgress) {
      await existingProgress.delete()
      return response.json({ status: 'removed' })
    } else {
      await CourseProgress.create({
        userId: user.id,
        courseId,
        moduleTitle,
        lessonTitle,
      })
      return response.json({ status: 'completed' })
    }
  }
}