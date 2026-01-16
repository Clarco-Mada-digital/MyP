import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Course from '#models/course'
import GuestAccess from '#models/guest_access'
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
        courseTrends
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

    const courses = await Course.query().preload('owner').orderBy('createdAt', 'desc')
    return view.render('pages/admin/courses', { courses })
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
}