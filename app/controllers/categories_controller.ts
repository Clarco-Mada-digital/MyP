import type { HttpContext } from '@adonisjs/core/http'
import Category from '#models/category'
import Course from '#models/course'
import vine from '@vinejs/vine'
import string from '@adonisjs/core/helpers/string'

export default class CategoriesController {
  /**
   * Display all categories for public browsing
   */
  async index({ view }: HttpContext) {
    const categories = await Category.query().orderBy('name', 'asc')
    
    // Get course count for each category
    const categoriesWithCount = await Promise.all(
      categories.map(async (category) => {
        const courseCount = await Course.query()
          .where('categoryId', category.id)
          .where('status', 'ready')
          .count('* as total')
          .then(result => result[0].$extras.total)
        
        return {
          ...category.toJSON(),
          courseCount
        }
      })
    )

    return view.render('pages/categories/index', { categories: categoriesWithCount })
  }

  /**
   * Display courses in a specific category
   */
  async show({ params, view, auth }: HttpContext) {
    const category = await Category.findByOrFail('slug', params.slug)
    
    const courses = await Course.query()
      .where('categoryId', category.id)
      .where('status', 'ready')
      .preload('owner')
      .orderBy('createdAt', 'desc')

    if (auth.user) {
      // Attach progress for authenticated users
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

    return view.render('pages/categories/show', { category, courses })
  }

  /**
   * Admin: List all categories with management options
   */
  async adminIndex({ view, auth, response }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    const categories = await Category.query()
      .preload('courses')
      .orderBy('name', 'asc')

    return view.render('pages/admin/categories', { categories })
  }

  /**
   * Admin: Show create category form
   */
  async create({ view, auth, response }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    return view.render('pages/admin/categories/create')
  }

  /**
   * Admin: Store new category
   */
  async store({ request, response, auth, session }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    const data = await vine.validate({
      schema: vine.object({
        name: vine.string().trim(),
        icon: vine.string().trim(),
        color: vine.string().trim()
      }),
      data: request.all()
    })

    const slug = string.slug(data.name).toLowerCase()

    try {
      await Category.create({
        name: data.name,
        slug,
        icon: data.icon || '📚',
        color: data.color || '#6366f1'
      })

      session.flash('notification', { 
        type: 'success', 
        message: `Catégorie "${data.name}" créée avec succès !` 
      })
      return response.redirect().toRoute('admin.categories')
    } catch (error) {
      session.flash('notification', { 
        type: 'error', 
        message: 'Erreur lors de la création de la catégorie.' 
      })
      return response.redirect().back()
    }
  }

  /**
   * Admin: Show edit category form
   */
  async edit({ params, view, auth, response }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    const category = await Category.findByOrFail('id', params.id)
    return view.render('pages/admin/categories/edit', { category })
  }

  /**
   * Admin: Update category
   */
  async update({ params, request, response, auth, session }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    const category = await Category.findByOrFail('id', params.id)

    const data = await vine.validate({
      schema: vine.object({
        name: vine.string().trim(),
        icon: vine.string().trim(),
        color: vine.string().trim()
      }),
      data: request.all()
    })

    const slug = string.slug(data.name).toLowerCase()

    try {
      category.merge({
        name: data.name,
        slug,
        icon: data.icon,
        color: data.color
      })
      await category.save()

      session.flash('notification', { 
        type: 'success', 
        message: `Catégorie "${data.name}" mise à jour avec succès !` 
      })
      return response.redirect().toRoute('admin.categories')
    } catch (error) {
      session.flash('notification', { 
        type: 'error', 
        message: 'Erreur lors de la mise à jour de la catégorie.' 
      })
      return response.redirect().back()
    }
  }

  /**
   * Admin: Delete category
   */
  async destroy({ params, response, auth, session }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    const category = await Category.findByOrFail('id', params.id)

    // Check if category has courses
    const courseCount = await Course.query().where('categoryId', category.id).count('* as total')
      .then(result => result[0].$extras.total)

    if (courseCount > 0) {
      session.flash('notification', { 
        type: 'error', 
        message: `Impossible de supprimer cette catégorie : ${courseCount} cours y sont associés.` 
      })
      return response.redirect().back()
    }

    try {
      await category.delete()
      session.flash('notification', { 
        type: 'success', 
        message: `Catégorie "${category.name}" supprimée avec succès !` 
      })
      return response.redirect().toRoute('admin.categories')
    } catch (error) {
      session.flash('notification', { 
        type: 'error', 
        message: 'Erreur lors de la suppression de la catégorie.' 
      })
      return response.redirect().back()
    }
  }
}
