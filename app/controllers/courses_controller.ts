import type { HttpContext } from '@adonisjs/core/http'
import Course from '#models/course'
import GeminiService from '#services/gemini_service'
import string from '@adonisjs/core/helpers/string'
import User from '#models/user'
import { DateTime } from 'luxon'

export default class CoursesController {
  private async attachProgress(courses: Course[], user: User) {
    for (const course of courses) {
      if (course.status !== 'ready') continue
      const totalLessons = course.content?.modules?.reduce((acc: number, m: any) => acc + (m.lessons?.length || 0), 0) || 0
      const completedCount = await user.related('progress').query()
        .where('courseId', course.id)
        .count('* as total')
        .then(res => res[0].$extras.total || 0)

      const percentage = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0
      course.$extras.progress = percentage
    }
  }

  /**
   * Show a course
   */
  async show({ params, view, auth }: HttpContext) {
    await auth.check()
    const course = await Course.findByOrFail('slug', params.slug)

    let completedLessons: string[] = []
    if (auth.user) {
      // Update last reviewed date if owner
      if (course.userId === auth.user.id) {
        course.lastReviewedAt = DateTime.now()
        await course.save()
      }

      const progress = await auth.user.related('progress').query().where('courseId', course.id)
      completedLessons = progress.map(p => `${p.moduleTitle}|${p.lessonTitle}`)
    }

    return view.render('pages/courses/show', { course, completedLessons })
  }

  /**
   * Browse all courses
   */
  async browse({ view, auth }: HttpContext) {
    await auth.check()
    const courses = await Course.query().where('status', 'ready').orderBy('createdAt', 'desc')
    if (auth.user) await this.attachProgress(courses, auth.user as User)
    return view.render('pages/courses/browse', { courses })
  }

  /**
   * Show user's courses
   */
  async myCourses({ auth, view }: HttpContext) {
    await auth.check()
    const user = auth.user! as User
    const courses = await user.related('courses').query().orderBy('createdAt', 'desc')
    await this.attachProgress(courses, user)

    // --- Dashboard Logic ---

    // 1. Last Played Course (most recently reviewed or created)
    const lastPlayed = courses
      .filter(c => c.status === 'ready')
      .sort((a, b) => {
        const dateA = a.lastReviewedAt?.toMillis() || a.createdAt.toMillis()
        const dateB = b.lastReviewedAt?.toMillis() || b.createdAt.toMillis()
        return dateB - dateA
      })[0]

    // 2. Stats
    const totalCourses = courses.length
    const coursesReady = courses.filter(c => c.status === 'ready')
    const completedCourses = coursesReady.filter(c => c.$extras.progress === 100).length

    // Estimons 15 min par leçon terminée
    const totalProgressRows = await user.related('progress').query().count('* as total')
    const totalCompletedLessons = totalProgressRows[0].$extras.total
    const learningHours = Math.round((totalCompletedLessons * 15) / 60)

    // 3. Badges (Gamification)
    const badges = []
    if (totalCourses >= 1) badges.push({ icon: '🌱', label: 'Débutant Curieux', desc: 'Premier cours créé' })
    if (totalCourses >= 5) badges.push({ icon: '📚', label: 'Bibliothécaire', desc: '5 cours dans la collection' })
    if (completedCourses >= 1) badges.push({ icon: '🎓', label: 'Diplômé', desc: 'Premier cours terminé à 100%' })
    if (learningHours >= 10) badges.push({ icon: '⏳', label: 'Assidu', desc: '10 heures d\'apprentissage' })
    if (badges.length === 0) badges.push({ icon: '👋', label: 'Bienvenue', desc: 'Commencez votre voyage !' })

    return view.render('pages/courses/my_courses', {
      courses,
      stats: { totalCourses, completedCourses, learningHours, totalLessons: totalCompletedLessons },
      lastPlayed,
      badges
    })
  }

  /**
   * Generate or Redirect to a course
   */
  async generate({ request, response, auth }: HttpContext) {
    const topic = request.input('topic')
    if (!topic) {
      return response.redirect().back()
    }

    // 1. Normalisation du sujet
    const cleanTopic = topic.toLowerCase()
      .replace(/^(donne moi un cours sur|je veux apprendre|apprendre|tout savoir sur|cours sur)\s+/i, '')
      .trim()

    const slug = string.slug(cleanTopic).toLowerCase()

    // 2. Recherche par slug exact
    let course = await Course.findBy('slug', slug)

    // 3. Recherche souple
    if (!course) {
      course = await Course.query()
        .where('title', 'like', `%${cleanTopic}%`)
        .orWhere('slug', 'like', `%${slug}%`)
        .first()
    }

    if (course) {
      return response.redirect().toPath(`/courses/${course.slug}`)
    }

    course = await Course.create({
      title: cleanTopic.charAt(0).toUpperCase() + cleanTopic.slice(1),
      slug,
      status: 'generating',
      userId: auth.user?.id || null,
    })

    this.generateCourseContent(course).catch(console.error)
    return response.redirect().toPath(`/courses/${course.slug}`)
  }

  private async generateCourseContent(course: Course) {
    try {
      const prompt = `Agis en tant qu'expert pédagogue et professeur d'université.
      Génère un cours magistral, complet et extrêmement détaillé pour le sujet suivant : "${course.title}".
      Le cours doit :
      1. Être structuré pour amener l'étudiant du niveau débutant au niveau expert.
      2. Chaque leçon doit être longue (min 500 mots par leçon), pédagogique et inclure des exemples concrets ou du code si applicable.
      3. Inclure des URLs de médias si pertinent (utilise des URLs Unsplash pour les images et des URLs d'exemple .mp4 ou .mp3 pour les vidéos/audios).
      Format de sortie : JSON STRICT.
      Structure attendue :
      {
        "description": "Une description longue et captivante du cours (min 100 mots)",
        "level": "Débutant, Intermédiaire ou Expert",
        "image": "URL d'une image Unsplash en rapport avec le sujet",
        "modules": [
          {
            "title": "Titre du Module",
            "lessons": [
              {
                "title": "Titre de la leçon",
                "content": "Contenu très détaillé de la leçon au format Markdown ou texte riche",
                "video_url": "URL optionnelle d'une vidéo .mp4",
                "audio_url": "URL optionnelle d'un transcript audio .mp3"
              }
            ],
            "exercises": ["Liste de travaux pratiques"]
          }
        ]
      }`

      const content = await GeminiService.generateJson(prompt)
      course.description = content.description || ""
      course.content = content
      course.status = 'ready'
      await course.save()
    } catch (error) {
      const fs = await import('node:fs')
      fs.writeFileSync('generation_error.log', `Topic: ${course.title}\nError: ${error.message}\nStack: ${error.stack}`)
      console.error('Gemini Generation Error:', error)
      course.status = 'error'
      await course.save()
    }
  }

  /**
   * Delete a course
   */
  async destroy({ params, auth, response, session }: HttpContext) {
    const course = await Course.findOrFail(params.id)

    if (course.userId !== auth.user!.id) {
      session.flash('notification', { type: 'error', message: "Vous n'êtes pas autorisé à supprimer ce cours." })
      return response.redirect().back()
    }

    await course.delete()
    session.flash('notification', { type: 'success', message: 'Cours supprimé avec succès !' })
    return response.redirect().back()
  }
}