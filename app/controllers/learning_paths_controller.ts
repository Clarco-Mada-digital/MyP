import type { HttpContext } from '@adonisjs/core/http'
import LearningPath from '#models/learning_path'
import CourseProgress from '#models/course_progress'

export default class LearningPathsController {
  /**
   * API endpoint pour récupérer les parcours en JSON
   */
  async apiIndex({ request, response, auth }: HttpContext) {
    await auth.check()

    const query = LearningPath.query()

    if (auth.user?.isAdmin) {
      // Admin sees everything
    } else if (request.input('mine')) {
      query.where('userId', auth.user!.id)
    } else {
      query.where((q) => {
        q.where('isPublished', true)
        if (auth.user) {
          q.orWhere('userId', auth.user.id)
        }
      })
    }

    const paths = await query
      .preload('courses', (q) => {
        q.orderBy('learning_path_courses.order', 'asc')
      })
      .orderBy('createdAt', 'desc')

    if (auth.user) {
      for (const path of paths) {
        let completedCount = 0
        for (const course of path.courses) {
          const totalLessons = course.content?.modules?.reduce((acc: number, m: any) => acc + (m.lessons?.length || 0), 0) || 0
          const progressCount = await CourseProgress.query()
            .where('userId', auth.user.id)
            .where('courseId', course.id)
            .count('* as total')
            .then(res => Number(res[0].$extras.total) || 0)

          if (totalLessons > 0 && progressCount >= totalLessons) {
            completedCount++
          }
        }

        path.completedCount = completedCount
        path.totalCount = path.courses.length
        path.progressPercent = path.totalCount > 0
          ? Math.round((completedCount / path.totalCount) * 100)
          : 0
      }
    }

    return response.json({ paths })
  }

  /**
   * Liste de tous les parcours
   */
  async index({ view, auth }: HttpContext) {
    await auth.check()

    const query = LearningPath.query()

    if (auth.user?.isAdmin) {
      // Admin sees everything
    } else {
      query.where((q) => {
        q.where('isPublished', true)
        if (auth.user) {
          q.orWhere('userId', auth.user.id)
        }
      })
    }

    const paths = await query
      .preload('courses', (q) => {
        q.orderBy('learning_path_courses.order', 'asc')
      })
      .orderBy('createdAt', 'desc')

    if (auth.user) {
      for (const path of paths) {
        let completedCount = 0
        for (const course of path.courses) {
          const totalLessons = course.content?.modules?.reduce((acc: number, m: any) => acc + (m.lessons?.length || 0), 0) || 0
          const progressCount = await CourseProgress.query()
            .where('userId', auth.user.id)
            .where('courseId', course.id)
            .count('* as total')
            .then(res => Number(res[0].$extras.total) || 0)

          if (totalLessons > 0 && progressCount >= totalLessons) {
            completedCount++
          }
        }

        path.completedCount = completedCount
        path.totalCount = path.courses.length
        path.progressPercent = path.totalCount > 0
          ? Math.round((completedCount / path.totalCount) * 100)
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

    const query = LearningPath.query().where('slug', params.slug)

    if (auth.user?.isAdmin) {
      // Admin bypass filters
    } else {
      query.where((q) => {
        q.where('isPublished', true)
        if (auth.user) {
          q.orWhere('userId', auth.user.id)
        }
      })
    }

    const path = await query
      .preload('courses', (q) => {
        q.orderBy('learning_path_courses.order', 'asc')
        q.preload('category')
      })
      .firstOrFail()

    if (auth.user) {
      for (const course of path.courses) {
        const totalLessons = course.content?.modules?.reduce((acc: number, m: any) => acc + (m.lessons?.length || 0), 0) || 0
        const progressCount = await CourseProgress.query()
          .where('userId', auth.user.id)
          .where('courseId', course.id)
          .count('* as total')

        course.lessonsCompleted = Number(progressCount[0].$extras.total) || 0
        course.isCompleted = totalLessons > 0 && course.lessonsCompleted >= totalLessons
      }
    }

    const completedCount = auth.user
      ? path.courses.filter(c => c.isCompleted).length
      : 0

    return view.render('pages/learning_paths/show', { path, completedCount })
  }

  async store({ request, auth, response }: HttpContext) {
    const { title, description, courseIds } = request.all()
    const { default: string } = await import('@adonisjs/core/helpers/string')

    const baseSlug = string.slug(title).toLowerCase()
    let slug = baseSlug
    let counter = 1
    while (await LearningPath.findBy('slug', slug)) {
      slug = `${baseSlug}-${counter}`
      counter++
    }

    const path = await LearningPath.create({
      title,
      description,
      slug,
      userId: auth.user!.id,
      isPublished: false
    })

    if (courseIds && courseIds.length > 0) {
      const pivotData: any = {}
      courseIds.forEach((id: string, index: number) => {
        pivotData[id] = { order: index }
      })
      await path.related('courses').attach(pivotData)
    }

    return response.json({ success: true, path })
  }

  async destroy({ params, auth, response }: HttpContext) {
    const path = await LearningPath.query()
      .where('id', params.id)
      .where('userId', auth.user!.id)
      .firstOrFail()

    await path.delete()
    return response.json({ success: true })
  }
}