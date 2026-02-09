import Env from '#start/env'
import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Course from '#models/course'
import Category from '#models/category'
import LearningPath from '#models/learning_path'
import GuestAccess from '#models/guest_access'
import CourseDeletionRequest from '#models/course_deletion_request'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import ApplicationSetting from '#models/application_setting'
import GeminiService from '#services/gemini_service'
import OpenRouterService from '#services/openrouter_service'
import CoursesController from '#controllers/courses_controller'
import BackupService from '#services/backup_service'
import DatabaseBackup from '#models/database_backup'

export default class AdminController {
  async index({ view, auth, response }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    const totalUsers = await User.query().count('* as total').then(r => r[0].$extras.total)
    const totalCourses = await Course.query().count('* as total').then(r => r[0].$extras.total)
    const totalPaths = await LearningPath.query().count('* as total').then(r => r[0].$extras.total)
    const totalGuestAccess = await GuestAccess.query().count('* as total').then(r => r[0].$extras.total)
    const pendingDeletions = await CourseDeletionRequest.query().where('status', 'pending').count('* as total').then(r => r[0].$extras.total)

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
    const isSQLite = Env.get('DB_CONNECTION') === 'sqlite'

    const userTrends = await db.from('users')
      .select(db.raw(isSQLite ? "date(created_at) as date" : "DATE_FORMAT(created_at, '%Y-%m-%d') as date"))
      .count('* as count')
      .where('created_at', '>=', sevenDaysAgo)
      .groupBy('date')
      .orderBy('date', 'asc')

    const courseTrends = await db.from('courses')
      .select(db.raw(isSQLite ? "date(created_at) as date" : "DATE_FORMAT(created_at, '%Y-%m-%d') as date"))
      .count('* as count')
      .where('created_at', '>=', sevenDaysAgo)
      .groupBy('date')
      .orderBy('date', 'asc')

    const recentUsers = await User.query().orderBy('createdAt', 'desc').limit(5)
    const recentCourses = await Course.query().preload('owner').orderBy('createdAt', 'desc').limit(5)
    const recentPaths = await LearningPath.query().preload('courses').orderBy('createdAt', 'desc').limit(5)

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
            country: acc.country,
            city: acc.city,
            countryCode: acc.countryCode,
            userAgent: acc.userAgent,
            courseTitle: course?.title || 'Cours inconnu',
            createdAt: acc.createdAt
          }
        }))
      })

    return view.render('pages/admin/dashboard', {
      stats: {
        totalUsers,
        totalCourses,
        totalPaths,
        totalGuestAccess,
        pendingDeletions,
        coursesByStatus,
        userTrends,
        courseTrends,
        categoriesWithStats
      },
      recentUsers,
      recentCourses,
      recentPaths,
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
   * List all courses with pagination and search
   */
  async courses({ view, auth, response, request }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    const page = request.input('page', 1)
    const limit = 20 // 20 cours par page
    const search = request.input('search', '')
    const status = request.input('status', '')
    const categoryId = request.input('category_id', '')

    // Build query with filters
    const query = Course.query()
      .preload('owner')
      .preload('category')
      .orderBy('createdAt', 'desc')

    // Apply search filter
    if (search) {
      query.where((builder) => {
        builder
          .where('title', 'LIKE', `%${search}%`)
          .orWhere('slug', 'LIKE', `%${search}%`)
          .orWhereHas('owner', (ownerQuery) => {
            ownerQuery.where('fullName', 'LIKE', `%${search}%`)
              .orWhere('email', 'LIKE', `%${search}%`)
          })
      })
    }

    // Apply status filter
    if (status) {
      query.where('status', status)
    }

    // Apply category filter
    if (categoryId) {
      query.where('categoryId', categoryId)
    }

    const courses = await query.paginate(page, limit)

    // Get all categories for dropdown
    const categories = await Category.query().orderBy('name', 'asc')

    return view.render('pages/admin/courses', {
      courses,
      categories,
      currentPage: page,
      limit,
      filters: {
        search,
        status,
        categoryId
      }
    })
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
      const coursesWithoutCategory = await Course.query().whereNull('categoryId')

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
   * Download the database backup or export data
   */
  async downloadBackup({ request, response, session }: HttpContext) {
    const format = request.input('format', 'sqlite')
    const date = DateTime.now().toFormat('yyyy-MM-dd_HH-mm')

    if (format === 'json') {
      const users = await User.all()
      const courses = await Course.all()
      const categories = await Category.all()
      const paths = await LearningPath.all()

      const exportData = {
        exportedAt: DateTime.now().toISO(),
        users,
        courses,
        categories,
        paths
      }

      return response
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="export_myp_${date}.json"`)
        .send(JSON.stringify(exportData, null, 2))
    }

    if (format === 'csv') {
      const users = await User.all()
      const courses = await Course.query().preload('category')

      let csvContent = '\uFEFF' // UTF-8 BOM for Excel

      // Users Section
      csvContent += '--- UTILISATEURS ---\n'
      csvContent += 'ID,Nom Complet,Email,Admin,Date Inscription\n'
      users.forEach(u => {
        csvContent += `${u.id},"${u.fullName}",${u.email},${u.isAdmin ? 'Oui' : 'Non'},${u.createdAt.toFormat('dd/MM/yyyy HH:mm')}\n`
      })

      csvContent += '\n\n'

      // Courses Section
      csvContent += '--- COURS ---\n'
      csvContent += 'ID,Titre,Statut,Catégorie,Propriétaire,Date Création\n'
      for (const c of courses) {
        csvContent += `${c.id},"${c.title}",${c.status},"${c.category?.name || 'N/A'}",${c.userId},${c.createdAt.toFormat('dd/MM/yyyy HH:mm')}\n`
      }

      return response
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="export_myp_${date}.csv"`)
        .send(csvContent)
    }

    // Default: SQLite backup
    if (Env.get('DB_CONNECTION') !== 'sqlite') {
      session.flash('notification', {
        type: 'error',
        message: 'La sauvegarde directe du fichier de base de données n\'est disponible que pour SQLite. Pour MySQL, utilisez les exports JSON ou CSV.'
      })
      return response.redirect().back()
    }

    const dbPath = app.tmpPath('db.sqlite3')
    return response.attachment(dbPath, `backup_myp_${date}.sqlite3`)
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

  async settings({ view, auth, response }: HttpContext) {
    if (!auth.user?.isAdmin) return response.unauthorized()
    const activeCloudProvider = await ApplicationSetting.getValue('active_cloud_provider', 'gemini')
    const geminiModels = await GeminiService.getModels()
    const openRouterModels = await OpenRouterService.getModels()
    return view.render('pages/admin/settings', { activeCloudProvider, geminiModels, openRouterModels })
  }

  async updateSettings({ request, response, auth, session }: HttpContext) {
    if (!auth.user?.isAdmin) return response.unauthorized()
    const provider = request.input('active_cloud_provider')
    await ApplicationSetting.setValue('active_cloud_provider', provider)
    session.flash('notification', { type: 'success', message: 'Configuration IA mise à jour' })
    return response.redirect().back()
  }

  /**
   * Fix all course images (bulk)
   */
  async fixAllCourseImages({ auth, response, session }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    try {
      const courses = await Course.query().where('status', 'ready').orWhere('status', 'error')
      let fixedCount = 0

      for (const course of courses) {
        if (!course.content) continue;

        // Verify and potentially fix the image
        const currentImage = course.content.image || ''
        const fixedImage = await CoursesController.verifyAndFixImage(currentImage, course.title)

        if (fixedImage !== currentImage) {
          const newContent = { ...course.content }
          newContent.image = fixedImage
          course.content = newContent
          // If it was in error, maybe set it to ready? Not necessarily, error might be due to other things.
          await course.save()
          fixedCount++
        }
      }

      session.flash('notification', {
        type: 'success',
        message: `${fixedCount} images de cours ont été réparées/mises à jour !`
      })
      return response.redirect().back()

    } catch (error) {
      console.error(error)
      session.flash('notification', {
        type: 'error',
        message: 'Erreur lors de la réparation des images.'
      })
      return response.redirect().back()
    }
  }

  /**
   * Show backup management page
   */
  async backupManagement({ view, auth, response }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    const backups = await BackupService.getBackups()
    const tables = await BackupService.getDatabaseTables()

    return view.render('pages/admin/backup', { 
      backups, 
      tables,
      isMySQL: Env.get('DB_CONNECTION') === 'mysql'
    })
  }

  /**
   * Create a manual backup
   */
  async createBackup({ response, auth, session }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    try {
      await BackupService.createBackup('manual')
      session.flash('notification', {
        type: 'success',
        message: '✅ Sauvegarde créée avec succès !'
      })
    } catch (error) {
      console.error('Backup error:', error)
      session.flash('notification', {
        type: 'error',
        message: `❌ Erreur lors de la sauvegarde: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      })
    }

    return response.redirect().back()
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup({ params, response, auth, session }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    try {
      const backup = await DatabaseBackup.findOrFail(params.id)
      await BackupService.restoreBackup(backup.filepath)
      
      session.flash('notification', {
        type: 'success',
        message: '✅ Base de données restaurée avec succès !'
      })
    } catch (error) {
      console.error('Restore error:', error)
      session.flash('notification', {
        type: 'error',
        message: `❌ Erreur lors de la restauration: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      })
    }

    return response.redirect().back()
  }

  /**
   * Download backup file
   */
  async downloadBackupFile({ params, response, auth }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    try {
      const { filepath, filename } = await BackupService.downloadBackup(params.id)
      return response.attachment(filepath, filename)
    } catch (error) {
      return response.badRequest(error instanceof Error ? error.message : 'Erreur inconnue')
    }
  }

  /**
   * Delete a backup
   */
  async deleteBackup({ params, response, auth, session }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    try {
      await BackupService.deleteBackup(params.id)
      session.flash('notification', {
        type: 'success',
        message: '✅ Sauvegarde supprimée avec succès !'
      })
    } catch (error) {
      console.error('Delete backup error:', error)
      session.flash('notification', {
        type: 'error',
        message: `❌ Erreur lors de la suppression: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      })
    }

    return response.redirect().back()
  }

  /**
   * Configure automatic backup settings
   */
  async updateBackupSettings({ request, response, auth, session }: HttpContext) {
    if (!auth.user?.isAdmin) {
      return response.unauthorized('Accès réservé aux administrateurs')
    }

    try {
      const enabled = request.input('auto_backup_enabled', false)
      const frequency = request.input('backup_frequency', 'daily')
      
      await ApplicationSetting.setValue('auto_backup_enabled', enabled)
      await ApplicationSetting.setValue('backup_frequency', frequency)

      session.flash('notification', {
        type: 'success',
        message: '✅ Paramètres de sauvegarde automatique mis à jour !'
      })
    } catch (error) {
      console.error('Update backup settings error:', error)
      session.flash('notification', {
        type: 'error',
        message: '❌ Erreur lors de la mise à jour des paramètres'
      })
    }

    return response.redirect().back()
  }
}