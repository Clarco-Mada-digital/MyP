import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Course from '#models/course'
import Category from '#models/category'
import GuestAccess from '#models/guest_access'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

export default class AdminController {
  async index({ view, auth, response }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    const totalUsers = await User.query().count('* as total').then(r => r[0].$extras.total)
    const totalCourses = await Course.query().count('* as total').then(r => r[0].$extras.total)
    const totalGuestAccess = await GuestAccess.query().count('* as total').then(r => r[0].$extras.total)

    const coursesByStatus = await Course.query()
      .select('status')
      .count('* as total')
      .groupBy('status')
      .then(rows => {
        return rows.reduce((acc, row) => {
          acc[row.status] = row.$extras.total
          return acc
        }, {} as Record<string, number>)
      })

    // Statistics by category
    const categoriesWithStats = await Category.query()
      .leftJoin('courses', 'categories.id', 'courses.category_id')
      .select('categories.*')
      .select(db.raw('COUNT(courses.id) as total_courses'))
      .select(db.raw('SUM(CASE WHEN courses.status = \'ready\' THEN 1 ELSE 0 END) as ready_courses'))
      .groupBy('categories.id')
      .orderBy('categories.name', 'asc')

    // Trends (last 7 days)
    const sevenDaysAgo = DateTime.now().minus({ days: 7 }).toSQLDate()!

    const userTrends = await db.from('users')
      .select(db.raw("date(created_at) as date"))
      .count('* as count')
      .where('created_at', '>=', sevenDaysAgo)
      .groupBy('date')
      .orderBy('date', 'asc')

    const courseTrends = await db.from('courses')
      .select(db.raw("date(created_at) as date"))
      .count('* as count')
      .where('created_at', '>=', sevenDaysAgo)
      .groupBy('date')
      .orderBy('date', 'asc')

    const recentUsers = await User.query().orderBy('createdAt', 'desc').limit(5)
    const recentCourses = await Course.query().preload('owner').orderBy('createdAt', 'desc').limit(5)

    const recentGuestAccess = await GuestAccess.query()
      .orderBy('createdAt', 'desc')
      .limit(5)
      .then(async (accesses) => {
        return Promise.all(accesses.map(async (acc) => {
          const course = await Course.find(acc.courseId)
          // On évite toJSON() ici car il transforme les dates en strings,
          // ce qui casse le .toRelative() dans le template Edge.
          return {
            ipAddress: acc.ipAddress,
            courseTitle: course?.title || 'Cours inconnu',
            createdAt: acc.createdAt
          }
        }))
      })

    return view.render('pages/admin/dashboard', {
      stats: {
        totalUsers,
        totalCourses,
        totalGuestAccess,
        coursesByStatus,
        userTrends,
        courseTrends,
        categoriesWithStats
      },
      recentUsers,
      recentCourses,
      recentGuestAccess
    })
  }
  /**
   * List all users
   */
  async users({ view, auth, response }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    const users = await User.query().orderBy('createdAt', 'desc')
    return view.render('pages/admin/users', { users })
  }

  /**
   * Toggle admin status for a user
   */
  async toggleAdmin({ params, auth, response, session }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    const user = await User.findOrFail(params.id)

    // Prevent self-demotion
    if (user.id === auth.user.id) {
      session.flash('notification', { type: 'error', message: "Vous ne pouvez pas retirer vos propres droits admin." })
      return response.redirect().back()
    }

    // Prevent removing the last admin
    if (user.isAdmin) {
      const adminCount = await User.query().where('isAdmin', true).count('* as total').then(r => r[0].$extras.total)
      if (adminCount <= 1) {
        session.flash('notification', { type: 'error', message: "Impossible de retirer les droits du dernier administrateur." })
        return response.redirect().back()
      }
    }

    user.isAdmin = !user.isAdmin
    await user.save()

    session.flash('notification', { type: 'success', message: `Droits mis à jour pour ${user.fullName}` })
    return response.redirect().back()
  }

  /**
   * List all courses
   */
  async courses({ view, auth, response }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    const courses = await Course.query()
      .preload('owner')
      .preload('category')
      .orderBy('createdAt', 'desc')

    // Get all categories for the dropdown
    const categories = await Category.query().orderBy('name', 'asc')

    return view.render('pages/admin/courses', { courses, categories })
  }

  /**
   * Assign default categories to courses without categories
   */
  async assignDefaultCategories({ auth, response, session }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    try {
      // Get courses without categories
      const coursesWithoutCategory = await Course.query().where('categoryId', null)

      // Get or create default category
      let defaultCategory = await Category.query().where('name', 'General').first()

      if (!defaultCategory) {
        defaultCategory = await Category.create({
          name: 'General',
          slug: 'general',
          icon: '📚',
          color: '#6366f1'
        })
      }

      // Assign default category to all courses without one
      let updatedCount = 0
      for (const course of coursesWithoutCategory) {
        course.categoryId = defaultCategory.id
        await course.save()
        updatedCount++
      }

      session.flash('notification', {
        type: 'success',
        message: `${updatedCount} cours ont été assignés à la catégorie "General" avec succès !`
      })
      return response.redirect().back()
    } catch (error) {
      session.flash('notification', {
        type: 'error',
        message: 'Erreur lors de l\'assignation des catégories par défaut.'
      })
      return response.redirect().back()
    }
  }

  /**
   * Update course category (admin)
   */
  async updateCourseCategory({ params, request, response, auth, session }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    const course = await Course.findOrFail(params.id)
    const categoryId = request.input('category_id')

    try {
      course.categoryId = categoryId || null
      await course.save()

      session.flash('notification', {
        type: 'success',
        message: `Catégorie du cours "${course.title}" mise à jour avec succès !`
      })
      return response.redirect().back()
    } catch (error) {
      session.flash('notification', {
        type: 'error',
        message: 'Erreur lors de la mise à jour de la catégorie.'
      })
      return response.redirect().back()
    }
  }

  /**
   * Update course cover image (admin)
   */
  async updateCourseImage({ params, request, response, auth, session }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    const course = await Course.findOrFail(params.id)
    const imageUrl = request.input('image_url')

    try {
      // Ensure content is an object
      const content = typeof course.content === 'object' ? { ...course.content } : {}
      content.image = imageUrl

      course.content = content
      await course.save()

      session.flash('notification', {
        type: 'success',
        message: `Image du cours "${course.title}" mise à jour avec succès !`
      })
      return response.redirect().back()
    } catch (error) {
      console.error(error)
      session.flash('notification', {
        type: 'error',
        message: 'Erreur lors de la mise à jour de l\'image.'
      })
      return response.redirect().back()
    }
  }

  /**
   * Delete a course (admin)
   */
  async deleteCourse({ params, auth, response, session }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    const course = await Course.findOrFail(params.id)
    await course.delete()

    session.flash('notification', { type: 'success', message: `Cours "${course.title}" supprimé avec succès.` })
    return response.redirect().back()
  }
  /**
   * Download the database backup
   */
  async downloadBackup({ response }: HttpContext) {
    const dbPath = app.tmpPath('db.sqlite3')
    const date = DateTime.now().toFormat('yyyy-MM-dd_HH-mm')
    return response.download(dbPath, `backup_myp_${date}.sqlite3`)
  }

  /**
   * Restore the database from a backup
   */
  async restoreBackup({ request, response, session }: HttpContext) {
    const backupFile = request.file('backup', {
      size: '100mb',
      extnames: ['sqlite3', 'sqlite', 'db']
    })

    if (!backupFile) {
      session.flash('notification', { type: 'error', message: 'Veuillez sélectionner un fichier valide.' })
      return response.redirect().back()
    }

    if (!backupFile.isValid) {
      session.flash('notification', { type: 'error', message: 'Fichier invalide ou trop volumineux.' })
      return response.redirect().back()
    }

    try {
      // We overwrite the existing database
      await backupFile.move(app.tmpPath(), {
        name: 'db.sqlite3',
        overwrite: true
      })

      session.flash('notification', { type: 'success', message: 'Base de données restaurée avec succès !' })
      return response.redirect().back()
    } catch (error) {
      console.error('Restore error:', error)
      session.flash('notification', { type: 'error', message: 'Erreur lors de la restauration.' })
      return response.redirect().back()
    }
  }
}