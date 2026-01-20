import type { HttpContext } from '@adonisjs/core/http'
import LearningPath from '#models/learning_path'
import Course from '#models/course'
import string from '@adonisjs/core/helpers/string'

export default class LearningPathsController {
  /**
   * Liste des parcours (Admin)
   */
  async index({ view }: HttpContext) {
    const paths = await LearningPath.query()
      .preload('courses')
      .orderBy('createdAt', 'desc')

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
  async store({ request, response, session }: HttpContext) {
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

    session.flash('success', 'Parcours créé avec succès !')
    return response.redirect().toRoute('admin.learning_paths.edit', { id: path.id })
  }

  /**
   * Formulaire d'édition
   */
  async edit({ params, view }: HttpContext) {
    const path = await LearningPath.query()
      .where('id', params.id)
      .preload('courses', (query) => {
        query.orderBy('learning_path_courses.order', 'asc')
      })
      .firstOrFail()

    const availableCourses = await Course.query()
      .where('status', 'ready')
      .orderBy('title', 'asc')

    return view.render('pages/admin/learning_paths/edit', { path, availableCourses })
  }

  /**
   * Mettre à jour un parcours
   */
  async update({ params, request, response, session }: HttpContext) {
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

    session.flash('success', 'Parcours mis à jour !')
    return response.redirect().back()
  }

  /**
   * Ajouter un cours au parcours
   */
  async addCourse({ params, request, response, session }: HttpContext) {
    const path = await LearningPath.findOrFail(params.id)
    const courseId = request.input('course_id')

    await path.related('courses').attach({
      [courseId]: {
        order: path.courses.length + 1,
        is_required: true
      }
    })

    session.flash('success', 'Cours ajouté au parcours !')
    return response.redirect().back()
  }

  /**
   * Réorganiser les cours
   */
  async reorder({ params, request, response, session }: HttpContext) {
    const path = await LearningPath.query().where('id', params.id).preload('courses', (q) => q.orderBy('learning_path_courses.order', 'asc')).firstOrFail()
    const courseId = parseInt(request.input('course_id'))
    const direction = request.input('direction') // 'up' or 'down'

    const courses = path.courses
    const index = courses.findIndex(c => c.id === courseId)

    if (index === -1) return response.redirect().back()

    if (direction === 'up' && index > 0) {
      // Swap with previous
      const currentOrder = courses[index].$extras.pivot_order
      const prevOrder = courses[index - 1].$extras.pivot_order

      await path.related('courses').pivotQuery().where('course_id', courses[index].id).update({ order: prevOrder })
      await path.related('courses').pivotQuery().where('course_id', courses[index - 1].id).update({ order: currentOrder })
    } else if (direction === 'down' && index < courses.length - 1) {
      // Swap with next
      const currentOrder = courses[index].$extras.pivot_order
      const nextOrder = courses[index + 1].$extras.pivot_order

      await path.related('courses').pivotQuery().where('course_id', courses[index].id).update({ order: nextOrder })
      await path.related('courses').pivotQuery().where('course_id', courses[index + 1].id).update({ order: currentOrder })
    }

    session.flash('success', 'Ordre mis à jour !')
    return response.redirect().back()
  }

  /**
   * Retirer un cours du parcours
   */
  async removeCourse({ params, request, response, session }: HttpContext) {
    const path = await LearningPath.findOrFail(params.id)
    const courseId = request.input('course_id')

    await path.related('courses').detach([courseId])

    session.flash('success', 'Cours retiré du parcours !')
    return response.redirect().back()
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
}