import type { HttpContext } from '@adonisjs/core/http'
import LearningPath from '#models/learning_path'
import Course from '#models/course'
import SharedLearningPath from '#models/shared_learning_path'
import string from '@adonisjs/core/helpers/string'
import { DateTime } from 'luxon'

export default class LearningPathsController {
  /**
   * Liste des parcours (Admin)
   */
  async index({ view, response }: HttpContext) {
    const paths = await LearningPath.query()
      .preload('courses')
      .orderBy('createdAt', 'desc')

    response.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    return view.render('pages/admin/learning_paths/index', { paths })
  }

  /**
   * Formulaire de création
   */
  async create({ view }: HttpContext) {
    const courses = await Course.query()
      .where('status', 'ready')
      .orderBy('title', 'asc')

    return view.render('pages/admin/learning_paths/create', { courses })
  }

  /**
   * Enregistrer un nouveau parcours
   */
  async store({ request, response, session, auth }: HttpContext) {
    const data = request.only([
      'title',
      'description',
      'icon',
      'difficulty',
      'color',
      'estimated_hours',
      'is_sequential',
      'is_published'
    ])

    const slug = string.slug(data.title).toLowerCase()

    const path = await LearningPath.create({
      ...data,
      slug,
      isSequential: data.is_sequential === 'on',
      isPublished: data.is_published === 'on',
      estimatedHours: data.estimated_hours ? parseInt(data.estimated_hours) : null
    })

    if (path.isPublished) {
      await this.syncCommunityShare(path, auth.user!.id)
    }

    session.flash('success', 'Parcours créé avec succès !')
    return response.redirect().toRoute('admin.learning_paths.edit', { id: path.id })
  }

  /**
   * Formulaire d'édition
   */
  async edit({ params, view, response }: HttpContext) {
    const path = await LearningPath.query()
      .where('id', params.id)
      .preload('courses', (query) => {
        query.orderBy('learning_path_courses.order', 'asc').preload('category')
      })
      .firstOrFail()

    // Detect if we need to normalize orders (duplicates or all zeros)
    const orders = path.courses.map(c => c.$extras.pivot_order)
    const needsNormalization = orders.length > 0 && (
      new Set(orders).size !== orders.length ||
      orders.every(o => o === 0)
    )

    if (needsNormalization) {
      await this.normalizeOrders(path)
      await path.load('courses', (query) => {
        query.orderBy('learning_path_courses.order', 'asc').preload('category')
      })
    }

    const availableCourses = await Course.query()
      .where('status', 'ready')
      .orderBy('title', 'asc')

    response.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    return view.render('pages/admin/learning_paths/edit', { path, availableCourses })
  }

  /**
   * Mettre à jour un parcours
   */
  async update({ params, request, response, session, auth }: HttpContext) {
    const path = await LearningPath.findOrFail(params.id)

    const data = request.only([
      'title',
      'description',
      'icon',
      'difficulty',
      'color',
      'estimated_hours',
      'is_sequential',
      'is_published'
    ])

    path.merge({
      ...data,
      slug: string.slug(data.title).toLowerCase(),
      isSequential: data.is_sequential === 'on',
      isPublished: data.is_published === 'on',
      estimatedHours: data.estimated_hours ? parseInt(data.estimated_hours) : null
    })

    await path.save()

    await this.syncCommunityShare(path, auth.user!.id)

    session.flash('success', 'Parcours mis à jour !')
    return response.redirect().back()
  }

  /**
   * Ajouter un cours au parcours
   */
  async addCourse({ params, request, response, session }: HttpContext) {
    const path = await LearningPath.query().where('id', params.id).preload('courses').firstOrFail()
    const courseId = request.input('course_id')

    if (!courseId) {
      session.flash('error', 'Veuillez sélectionner un cours.')
      return response.redirect().back()
    }

    // Avoid duplicates
    const alreadyExists = path.courses.some(c => c.id === parseInt(courseId))
    if (alreadyExists) {
      session.flash('error', 'Ce cours est déjà présent dans ce parcours.')
      return response.redirect().back()
    }

    // Get max order currently in the path
    const maxOrder = path.courses.reduce((max, c) => Math.max(max, c.$extras.pivot_order || 0), 0)

    await path.related('courses').attach({
      [courseId]: {
        order: maxOrder + 1,
        is_required: true
      }
    })

    session.flash('success', 'Cours ajouté au parcours !')
    // Using a timestamp to bypass possible browser/PWA cache
    return response.redirect().toPath(request.header('referer') + '?t=' + Date.now())
  }

  /**
   * Réorganiser les cours
   */
  async reorder({ params, request, response, session }: HttpContext) {
    const path = await LearningPath.query()
      .where('id', params.id)
      .preload('courses', (q) => q.orderBy('learning_path_courses.order', 'asc'))
      .firstOrFail()

    const courseId = parseInt(request.input('course_id'))
    const direction = request.input('direction')

    const index = path.courses.findIndex(c => c.id === courseId)
    if (index === -1) return response.redirect().back()

    // Swap logic
    if (direction === 'up' && index > 0) {
      const current = path.courses[index]
      const prev = path.courses[index - 1]

      const currentOrder = current.$extras.pivot_order
      const prevOrder = prev.$extras.pivot_order

      await path.related('courses').pivotQuery().where('course_id', current.id).update({ order: prevOrder })
      await path.related('courses').pivotQuery().where('course_id', prev.id).update({ order: currentOrder })
    } else if (direction === 'down' && index < path.courses.length - 1) {
      const current = path.courses[index]
      const next = path.courses[index + 1]

      const currentOrder = current.$extras.pivot_order
      const nextOrder = next.$extras.pivot_order

      await path.related('courses').pivotQuery().where('course_id', current.id).update({ order: nextOrder })
      await path.related('courses').pivotQuery().where('course_id', next.id).update({ order: currentOrder })
    }

    session.flash('success', 'Ordre mis à jour !')
    return response.redirect().toPath(request.header('referer') + '?t=' + Date.now())
  }

  /**
   * Normaliser les ordres (1, 2, 3...)
   */
  private async normalizeOrders(path: LearningPath) {
    // Sort by order then by created date as fallback
    const courses = await path.related('courses').query().orderBy('learning_path_courses.order', 'asc').orderBy('learning_path_courses.created_at', 'asc')

    let i = 1
    for (const course of courses) {
      await path.related('courses').pivotQuery().where('course_id', course.id).update({ order: i++ })
    }
  }

  /**
   * Retirer un cours du parcours
   */
  async removeCourse({ params, request, response, session }: HttpContext) {
    const path = await LearningPath.findOrFail(params.id)
    const courseId = request.input('course_id')

    await path.related('courses').detach([courseId])

    // Cleanup orders to avoid gaps
    await this.normalizeOrders(path)

    session.flash('success', 'Cours retiré du parcours !')
    return response.redirect().toPath(request.header('referer') + '?t=' + Date.now())
  }

  /**
   * Supprimer un parcours
   */
  async destroy({ params, response, session }: HttpContext) {
    const path = await LearningPath.findOrFail(params.id)
    await path.delete()

    session.flash('success', 'Parcours supprimé !')
    return response.redirect().toRoute('admin.learning_paths.index')
  }

  /**
   * Sync admin-published paths with the community
   */
  private async syncCommunityShare(path: LearningPath, adminId: number) {
    if (path.isPublished) {
      // Find or create a shared version
      const existing = await SharedLearningPath.query()
        .where('learningPathId', path.id)
        .where('userId', adminId)
        .first()

      if (existing) {
        existing.merge({
          title: path.title,
          description: path.description,
          isPublic: true,
          updatedAt: DateTime.now()
        })
        await existing.save()
      } else {
        await SharedLearningPath.create({
          learningPathId: path.id,
          userId: adminId,
          shareToken: SharedLearningPath.generateShareToken(),
          title: path.title,
          description: path.description,
          isPublic: true,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now()
        })
      }
    } else {
      // If we unpublish, we might want to hide it from community
      // Only delete if it was shared by an admin to avoid deleting user shares
      const existing = await SharedLearningPath.query()
        .where('learningPathId', path.id)
        .where('userId', adminId)
        .first()

      if (existing) {
        await existing.delete()
      }
    }
  }
}