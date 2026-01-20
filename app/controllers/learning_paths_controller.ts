import type { HttpContext } from '@adonisjs/core/http'
import LearningPath from '#models/learning_path'
import CourseProgress from '#models/course_progress'

export default class LearningPathsController {
  /**
   * Liste de tous les parcours
   */
  async index({ view, auth }: HttpContext) {
    await auth.check()

    const paths = await LearningPath.query()
      .where('isPublished', true)
      .preload('courses', (query) => {
        query.orderBy('learning_path_courses.order', 'asc')
      })
      .orderBy('createdAt', 'desc')

    // Calculer la progression pour chaque parcours si l'utilisateur est connecté
    if (auth.user) {
      for (const path of paths) {
        const courseIds = path.courses.map(c => c.id)

        // Compter combien de cours sont "terminés" (au moins 5 leçons)
        const completedCourses = await CourseProgress.query()
          .where('userId', auth.user.id)
          .whereIn('courseId', courseIds)
          .select('courseId')
          .groupBy('courseId')
          .havingRaw('COUNT(*) >= 5')

        path.completedCount = completedCourses.length
        path.totalCount = path.courses.length
        path.progressPercent = path.totalCount > 0
          ? Math.round((completedCourses.length / path.totalCount) * 100)
          : 0
      }
    }

    return view.render('pages/learning_paths/index', { paths })
  }

  /**
   * Détail d'un parcours
   */
  async show({ params, view, auth }: HttpContext) {
    await auth.check()

    const path = await LearningPath.query()
      .where('slug', params.slug)
      .where('isPublished', true)
      .preload('courses', (query) => {
        query.orderBy('learning_path_courses.order', 'asc')
        query.preload('category')
      })
      .firstOrFail()

    // Calculer la progression de chaque cours
    if (auth.user) {
      for (const course of path.courses) {
        const progressCount = await CourseProgress.query()
          .where('userId', auth.user.id)
          .where('courseId', course.id)
          .count('* as total')

        course.lessonsCompleted = Number(progressCount[0].$extras.total) || 0
        course.isCompleted = course.lessonsCompleted >= 5
      }
    }

    // Calculer le nombre total de cours complétés pour le message de félicitations
    const completedCount = auth.user
      ? path.courses.filter(c => (c as any).isCompleted).length
      : 0

    return view.render('pages/learning_paths/show', { path, completedCount })
  }
}