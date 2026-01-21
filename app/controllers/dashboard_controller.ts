import Env from '#start/env'
import type { HttpContext } from '@adonisjs/core/http'
import CourseProgress from '#models/course_progress'
import Bookmark from '#models/bookmark'
import db from '@adonisjs/lucid/services/db'

export default class DashboardController {
  async index({ auth, view }: HttpContext) {
    await auth.check()

    if (!auth.user) {
      return view.render('errors/unauthorized')
    }

    const userId = auth.user.id

    // 1. Cours démarrés (au moins une leçon commencée)
    const coursesStarted = await CourseProgress.query()
      .where('userId', userId)
      .select('courseId')
      .groupBy('courseId')

    const coursesStartedCount = coursesStarted.length

    // 2. Calculer les cours complétés (simplifié : au moins 5 leçons terminées)
    const completedCoursesData = await db
      .from('course_progresses')
      .where('user_id', userId)
      .select('course_id')
      .count('* as lessons_count')
      .groupBy('course_id')
      .havingRaw('COUNT(*) >= 5')

    const completedCount = completedCoursesData.length

    // 3. Taux de complétion moyen
    const avgCompletion = coursesStartedCount > 0
      ? Math.round((completedCount / coursesStartedCount) * 100)
      : 0

    // 4. Cours sauvegardés
    const bookmarksCount = await Bookmark.query()
      .where('userId', userId)
      .count('* as total')

    const totalBookmarks = Number(bookmarksCount[0].$extras.total) || 0

    // 5. Activité récente (derniers cours consultés)
    const recentProgress = await CourseProgress.query()
      .where('userId', userId)
      .preload('course', (query) => {
        query.preload('category')
      })
      .orderBy('updatedAt', 'desc')
      .limit(10)

    // Grouper par cours (garder seulement le plus récent par cours)
    const seenCourses = new Set()
    const recentCourses = recentProgress.filter(p => {
      if (seenCourses.has(p.courseId)) return false
      seenCourses.add(p.courseId)
      return true
    }).slice(0, 5)

    // 6. Sujets maîtrisés (basé sur les cours avec progression)
    const masterTopicsData = await db
      .from('courses')
      .join('course_progresses', 'courses.id', 'course_progresses.course_id')
      .where('course_progresses.user_id', userId)
      .whereNotNull('courses.topic_tag')
      .select('courses.topic_tag')
      .groupBy('courses.topic_tag')
      .havingRaw('COUNT(DISTINCT course_progresses.id) >= 3')
      .limit(10)

    const topics = masterTopicsData.map((t: any) => t.topic_tag)

    // 7. Progression par semaine (pour le graphique)
    const isSQLite = Env.get('DB_CONNECTION') === 'sqlite'
    let weeklyProgress: any[] = []

    if (isSQLite) {
      weeklyProgress = await db.rawQuery(`
        SELECT 
          strftime('%Y-%W', updated_at) as week,
          COUNT(DISTINCT course_id) as courses_count
        FROM course_progresses
        WHERE user_id = ?
          AND updated_at >= date('now', '-56 days')
        GROUP BY week
        ORDER BY week ASC
      `, [userId])
    } else {
      // MySQL
      const [rows]: [any[], any] = await db.rawQuery(`
        SELECT 
          DATE_FORMAT(updated_at, '%Y-%u') as week,
          COUNT(DISTINCT course_id) as courses_count
        FROM course_progresses
        WHERE user_id = ?
          AND updated_at >= DATE_SUB(NOW(), INTERVAL 56 DAY)
        GROUP BY week
        ORDER BY week ASC
      `, [userId])
      weeklyProgress = rows
    }

    // 8. Badges débloqués
    const badges = []
    if (completedCount >= 1) badges.push({ icon: '🎓', title: 'Premier Pas', description: 'Premier cours terminé' })
    if (completedCount >= 5) badges.push({ icon: '🏆', title: 'Apprenant Assidu', description: '5 cours terminés' })
    if (completedCount >= 10) badges.push({ icon: '⭐', title: 'Expert', description: '10 cours terminés' })
    if (totalBookmarks >= 5) badges.push({ icon: '📚', title: 'Collectionneur', description: '5 cours sauvegardés' })

    return view.render('pages/dashboard/index', {
      stats: {
        coursesStarted: coursesStartedCount,
        coursesCompleted: completedCount,
        avgCompletion,
        bookmarks: totalBookmarks
      },
      recentCourses,
      topics,
      weeklyProgress: weeklyProgress || [],
      badges
    })
  }
}