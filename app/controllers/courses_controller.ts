import type { HttpContext } from '@adonisjs/core/http'
import Course from '#models/course'
import Category from '#models/category'
import CourseDeletionRequest from '#models/course_deletion_request'
import GeminiService from '#services/gemini_service'
import OllamaService from '#services/ollama_service'
import AiProviderService from '#services/ai_provider_service'
import string from '@adonisjs/core/helpers/string'
import User from '#models/user'
import GuestAccess from '#models/guest_access'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Bookmark from '#models/bookmark'
import vine from '@vinejs/vine'

export default class CoursesController {
  private async attachProgress(courses: Course[], user: User) {
    for (const course of courses) {
      if (course.status !== 'ready') continue
      const totalLessons = course.content?.modules?.reduce((acc: number, m: any) => acc + (m.lessons?.length || 0), 0) || 0
      const completedCount = await user.related('progress').query()
        .where('courseId', course.id)
        .count('* as total')
        .then(res => (res[0] as any).$extras.total || 0)

      const percentage = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0
      course.$extras.progress = percentage
    }
  }

  /**
   * Show a course
   */
  async show({ params, view, auth, request, response, session }: HttpContext) {
    await auth.check()
    const course = await Course.query().where('slug', params.slug).preload('category').first()

    if (!course) {
      session.flash('notification', { type: 'error', message: 'Ce cours n\'existe pas ou a été supprimé.' })
      return response.redirect('/')
    }

    // Logique de restriction pour les invités (non connectés)
    if (!auth.user) {
      const ip = request.ip()
      const startOfMonth = DateTime.now().startOf('month')

      const access = await GuestAccess.query()
        .where('ipAddress', ip)
        .where('createdAt', '>=', startOfMonth.toSQL())
        .first()

      if (access) {
        if (access.courseId !== course.id) {
          session.flash('notification', {
            type: 'error',
            message: "Accès limité ! Vous suivez déjà un cours gratuit ce mois-ci. Inscrivez-vous gratuitement pour débloquer tous les cours !"
          })
          return response.redirect().toPath('/parcourir')
        }
      } else {
        const confirmed = request.input('confirm_guest_access') === '1'
        if (!confirmed) {
          return view.render('pages/courses/guest_warning', { course })
        }
        await GuestAccess.create({ ipAddress: ip, courseId: course.id })
      }
    }

    let completedLessons: string[] = []
    let isBookmarked = false

    if (auth.user) {
      if (course.userId === auth.user.id) {
        course.lastReviewedAt = DateTime.now()
        await course.save()
      }

      const progress = await auth.user.related('progress').query().where('courseId', course.id)
      completedLessons = progress.map(p => `${p.moduleTitle}|${p.lessonTitle}`)

      const bookmark = await Bookmark.query()
        .where('userId', auth.user.id)
        .where('courseId', course.id)
        .first()
      isBookmarked = !!bookmark
    }

    return view.render('pages/courses/show', { course, completedLessons, isBookmarked })
  }

  /**
   * Browse all courses
   */
  async browse({ view, auth, request }: HttpContext) {
    await auth.check()
    const categoryId = request.input('category')
    const searchQuery = request.input('search', '').trim()

    let coursesQuery = Course.query().where('status', 'ready').preload('category')

    if (categoryId) coursesQuery = coursesQuery.where('categoryId', categoryId)
    if (searchQuery) {
      coursesQuery = coursesQuery.andWhere((query) => {
        query.where('title', 'like', `%${searchQuery}%`)
          .orWhere('description', 'like', `%${searchQuery}%`)
      })
    }

    const page = request.input('page', 1)
    const courses = await coursesQuery.orderBy('createdAt', 'desc').paginate(page, 12)
    courses.baseUrl('/parcourir')
    courses.queryString(request.qs())

    if (auth.user) await this.attachProgress(courses.all(), auth.user as User)

    const categories = await db.from('categories')
      .leftJoin('courses', 'categories.id', 'courses.category_id')
      .select('categories.*')
      .select(db.raw('COUNT(CASE WHEN courses.status = ? THEN courses.id END) as course_count', ['ready']))
      .groupBy('categories.id')
      .orderBy('categories.name', 'asc')

    return view.render('pages/courses/browse', { courses, categories, selectedCategory: categoryId, searchQuery })
  }

  /**
   * Show user's courses
   */
  async myCourses({ auth, view }: HttpContext) {
    await auth.check()
    const user = auth.user! as User
    const courses = await user.related('courses').query().orderBy('createdAt', 'desc')
    await this.attachProgress(courses, user)

    const lastPlayed = courses
      .filter(c => c.status === 'ready')
      .sort((a, b) => {
        const dateA = a.lastReviewedAt?.toMillis() || a.createdAt.toMillis()
        const dateB = b.lastReviewedAt?.toMillis() || b.createdAt.toMillis()
        return dateB - dateA
      })[0]

    // 2. Check for pending deletion requests
    const pendingDeletionCourseIds = await db.from('course_deletion_requests')
      .where('status', 'pending')
      .select('course_id')
      .then(rows => rows.map(row => row.course_id))

    // Add deletion status to courses
    courses.forEach(course => {
      course.$extras.hasPendingDeletion = pendingDeletionCourseIds.includes(course.id)
    })

    // 2. Stats
    const totalCourses = courses.length
    const coursesReady = courses.filter(c => c.status === 'ready')
    const completedCourses = coursesReady.filter(c => c.$extras.progress === 100).length

    const totalProgressRows = await user.related('progress').query().count('* as total')
    const totalCompletedLessons = (totalProgressRows[0] as any).$extras.total
    const learningHours = Math.round((totalCompletedLessons * 15) / 60)

    const badges = []
    if (totalCourses >= 1) badges.push({ icon: '🌱', label: 'Débutant Curieux', desc: 'Premier cours créé' })
    if (totalCourses >= 5) badges.push({ icon: '📚', label: 'Bibliothécaire', desc: '5 cours dans la collection' })
    if (completedCourses >= 1) badges.push({ icon: '🎓', label: 'Diplômé', desc: 'Premier cours terminé à 100%' })
    if (learningHours >= 10) badges.push({ icon: '⏳', label: 'Assidu', desc: '10 heures d\'apprentissage' })
    if (badges.length === 0) badges.push({ icon: '👋', label: 'Bienvenue', desc: 'Commencez votre voyage !' })

    const bookmarks = await user.related('bookmarks').query().preload('course')
    const bookmarkedCourses = bookmarks.map(b => b.course).filter(c => c)
    await this.attachProgress(bookmarkedCourses, user)

    return view.render('pages/courses/my_courses', {
      courses,
      stats: { totalCourses, completedCourses, learningHours, totalLessons: totalCompletedLessons },
      lastPlayed,
      badges,
      bookmarkedCourses
    })
  }

  /**
   * Generate course
   */
  async generate({ request, response, auth, session }: HttpContext) {
    const topic = request.input('topic')
    const categoryId = request.input('category_id')
    const forceCreate = request.input('force_create') === 'true'

    if (!topic || !auth.user) return response.redirect().back()

    const topicTag = await this.extractTopicWithAI(topic, auth.user as User)
    const baseSlug = string.slug(topicTag).toLowerCase()
    let exactCourse = await Course.findBy('slug', baseSlug)
    let similarCourses: Course[] = []

    if (!forceCreate) {
      similarCourses = await Course.query()
        .where('status', 'ready')
        .andWhere((query) => {
          query.where('topicTag', topicTag)
            .orWhere('topicTag', 'LIKE', `%${topicTag}%`)
            .orWhere('title', 'LIKE', `%${topicTag}%`)
        })
        .limit(5)
    }

    if ((exactCourse || similarCourses.length > 0) && !forceCreate) {
      if (exactCourse && !similarCourses.find(c => c.id === exactCourse!.id)) similarCourses.unshift(exactCourse)
      session.put('pendingTopic', topic)
      session.put('pendingCategoryId', categoryId)
      session.put('similarCourses', similarCourses.map(c => ({ id: c.id, title: c.title, slug: c.slug, description: c.description })))
      return response.redirect().toRoute('courses.confirm')
    }

    let slug = baseSlug
    let counter = 1
    while (await Course.findBy('slug', slug)) {
      slug = `${baseSlug}-${counter}`
      counter++
    }

    const course = await Course.create({
      title: topic.charAt(0).toUpperCase() + topic.slice(1),
      slug,
      status: 'generating',
      userId: auth.user.id,
      categoryId: categoryId || null,
      topicTag
    })

    if (!categoryId) {
      try {
        const suggestedCategory = await this.categorizeCourseWithAI(course.title)
        if (suggestedCategory) {
          course.categoryId = suggestedCategory.id
          await course.save()
        }
      } catch (error) {
        console.error('[CoursesController] Auto-categorization failed:', error)
      }
    }

    const user = auth.user as User
    if (user.aiProvider === 'ollama') {
      course.status = 'waiting_local'
      await course.save()
    } else {
      this.generateCourseContent(course, user).catch(err => console.error('[CoursesController] Generation failure:', err))
    }

    return response.redirect().toPath(`/courses/${course.slug}`)
  }

  async confirm({ view, session, response }: HttpContext) {
    const pendingTopic = session.get('pendingTopic')
    if (!pendingTopic) return response.redirect('/')
    const pendingCategoryId = session.get('pendingCategoryId')
    const similarCourses = session.get('similarCourses') || []
    session.forget('pendingTopic')
    session.forget('pendingCategoryId')
    session.forget('similarCourses')
    return view.render('pages/courses/confirm', { pendingTopic, pendingCategoryId, similarCourses })
  }

  private async extractTopicWithAI(userPrompt: string, user: User): Promise<string> {
    const prompt = `Analyze: "${userPrompt}". Identify main subject. Output ONLY the subject noun. Examples: "Learn Python" -> "Python".`
    try {
      let tag = (user.aiProvider === 'ollama')
        ? await OllamaService.generateText(prompt, user.aiModel || 'llama3')
        : await GeminiService.generateText(prompt, user.aiModel || 'gemini-flash-latest')
      return tag.trim().replace(/^['"]|['"]$/g, '').replace(/\.$/, '') || string.slug(userPrompt)
    } catch (e) {
      return string.slug(userPrompt)
    }
  }

  private async categorizeCourseWithAI(courseTitle: string): Promise<Category | null> {
    const existingCategories = await Category.query().orderBy('name', 'asc')
    if (existingCategories.length === 0) {
      await this.createDefaultCategories()
      const categories = await Category.query().orderBy('name', 'asc')
      return await this.selectBestCategory(courseTitle, categories)
    }
    return await this.selectBestCategory(courseTitle, existingCategories)
  }

  private async createDefaultCategories(): Promise<void> {
    const defaultCategories = [
      { name: 'Développement Web', icon: '💻', color: '#3b82f6' },
      { name: 'Design & Créativité', icon: '🎨', color: '#ec4899' },
      { name: 'Marketing & Business', icon: '📈', color: '#10b981' },
      { name: 'Science & Technologie', icon: '🔬', color: '#8b5cf6' },
      { name: 'Langues & Communication', icon: '🗣️', color: '#f59e0b' },
      { name: 'Mathématiques & Logique', icon: '🧮', color: '#ef4444' },
      { name: 'Art & Culture', icon: '🎭', color: '#06b6d4' },
      { name: 'Santé & Bien-être', icon: '🏥', color: '#84cc16' }
    ]
    for (const cat of defaultCategories) {
      await Category.create({ name: cat.name, slug: string.slug(cat.name).toLowerCase(), icon: cat.icon, color: cat.color })
    }
  }

  private async selectBestCategory(courseTitle: string, categories: Category[]): Promise<Category | null> {
    const title = courseTitle.toLowerCase()
    if (title.match(/javascript|react|vue|angular|html|css|php|python|node|web|site|application|code|programming|développement|programmation/)) {
      return categories.find(c => c.name.toLowerCase().includes('web') || c.name.toLowerCase().includes('développement')) || categories[0]
    }
    return categories[0]
  }

  private async generateCourseContent(course: Course, user: User) {
    try {
      // --- BUILD PROMPT ---
      let prompt = ''
      if (user.aiProvider === 'ollama') {
        prompt = `Agis en tant qu'expert pédagogue.
      Sujet: "${course.title}".
      Génère un cours COMPLET et structuré (JSON).
      Objectif: De débutant à expert.
      Structure: 
        - 3 à 4 Modules maximum.
        - 2 à 3 leçons par module.
        - Un Quiz de validation (3 questions) à la fin de chaque module.
      Contenu:
        - Leçons détaillées (environ 300 mots/leçon).
        - Exemples de code, cas pratiques, explications claires.
      Format JSON STRICT (Attention: tout guillemet double à l'intérieur d'une chaîne doit être échappé \\", ou utilise des guillemets simples '' pour le code) :
      {
        "description": "Description captivante (min 100 mots)",
        "level": "Expert",
        "image": "Mots-clés pour l'image d'illustration (ex: python coding machine learning)",
        "sources": ["Source 1 (ex: MDN Web Docs)", "Source 2", "Source 3 ou plus"],
        "modules": [
          {
            "title": "Titre Module",
            "lessons": [
              {
                "title": "Titre Leçon",
                "content": "Contenu riche en Markdown (titres, listes, code blocks)...",
                "video_url": "URL .mp4 (optionnel)",
                "audio_url": "URL .mp3 (optionnel)"
              }
            ],
            "exercises": ["Exercice 1", "Exercice 2"],
            "flashcards": [
              {
                "question": "Question de mémorisation ?",
                "answer": "Réponse courte et précise."
              }
            ],
            "quiz": [
              {
                "question": "Question sur ce module ?",
                "options": ["Choix A", "Choix B", "Choix C", "Choix D"],
                "answer": "Choix A",
                "explanation": "Explication de la réponse."
              }
            ]
          }
        ]
      }`;
      } else {
        prompt = `Sujet: "${course.title}".
      Génère un cours structuré (JSON).
      Objectif: Synthétique & Percutant (Format "Flash Course").
      Structure: MAX 3 Modules, MAX 2 Leçons par module. 1 Quiz par module.
      Contenu: Essentiel uniquement (env. 200 mots/leçon).
      Format JSON STRICT (Attention: échappe les " par \\" à l'intérieur des textes, ou utilise des ' pour le code) :
      {
        "description": "Description courte",
        "level": "Intermédiaire",
        "image": "Sujet de l'image (mots-clés)",
        "sources": ["Source fiable 1", "Source fiable 2", "Source 3 ou plus"],
        "modules": [
          {
            "title": "Titre Module",
            "lessons": [
              {
                "title": "Titre Leçon",
                "content": "Contenu Markdown concis. (min 200 mots)."
              }
            ],
            "exercises": ["Exercice 1"],
            "flashcards": [
              {
                "question": "Concept clé ?",
                "answer": "Définition courte."
              }
            ],
            "quiz": [
              {
                "question": "Question simple ?",
                "options": ["A", "B", "C"],
                "answer": "A",
                "explanation": "Explication courte."
              }
            ]
          }
        ]
      }`;
      }

      const content = await AiProviderService.generateJson(prompt, user)

      course.description = content.description || ""
      content.image = await this.verifyAndFixImage(content.image, course.title)
      course.content = content
      course.status = 'ready'
      await course.save()
    } catch (error) {
      course.status = 'error'
      await course.save()
    }
  }

  private async verifyAndFixImage(url: string, topic: string): Promise<string> {
    const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1600&auto=format&fit=crop&q=80'

    const isImageAccessible = async (testUrl: string) => {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 3000)
        const res = await fetch(testUrl, { method: 'HEAD', signal: controller.signal })
        clearTimeout(timeoutId)
        return res.ok && res.headers.get('content-type')?.startsWith('image/')
      } catch { return false }
    }

    // 1. Essayer l'URL fournie (si elle est valide)
    if (url && url.startsWith('http') && await isImageAccessible(url)) {
      return url
    }

    // 2. Fallback sur Pollinations (Génère une image parfaite pour le sujet)
    const pollinationsUrl = `https://image.pollinations.ai/prompt/professional minimalist 3d illustration for ${encodeURIComponent(topic)}, technology style, high resolution?nologo=true&width=1200&height=630`
    if (await isImageAccessible(pollinationsUrl)) {
      return pollinationsUrl
    }

    // 3. Dernier recours : Image par défaut stable
    return DEFAULT_IMAGE
  }

  async toggleBookmark({ params, auth, response }: HttpContext) {
    await auth.check()
    const existing = await Bookmark.query().where('userId', auth.user!.id).where('courseId', params.id).first()
    if (existing) {
      await existing.delete()
      return response.json({ status: 'removed' })
    }
    await Bookmark.create({ userId: auth.user!.id, courseId: params.id })
    return response.json({ status: 'added' })
  }

  async flashcards({ params, view, auth }: HttpContext) {
    await auth.check()
    const course = await Course.findByOrFail('slug', params.slug)
    let flashcards = course.content?.flashcards || []
    if (flashcards.length === 0 && course.content?.modules) {
      course.content.modules.forEach((m: any) => { if (m.flashcards) flashcards = [...flashcards, ...m.flashcards] })
    }
    return view.render('pages/courses/flashcards', { course, flashcards })
  }

  /**
   * Request course deletion (with checks for learning paths)
   */
  async requestDeletion({ params, auth, request, response, session }: HttpContext) {
    await auth.check()
    const user = auth.user!
    const course = await Course.query().where('id', params.id).preload('category').first()

    if (!course) {
      session.flash('notification', { type: 'error', message: "Ce cours n'existe pas." })
      return response.redirect().back()
    }

    if (course.userId !== user.id) {
      session.flash('notification', { type: 'error', message: "Vous n'êtes pas autorisé à supprimer ce cours." })
      return response.redirect().back()
    }

    // Vérifier si le cours est dans un parcours publié
    const learningPathCount = await db.from('learning_path_courses')
      .where('course_id', course.id)
      .count('* as total')

    const isInLearningPath = Number(learningPathCount[0].total) > 0

    if (isInLearningPath) {
      session.flash('notification', {
        type: 'error',
        message: "❌ Impossible de supprimer ce cours car il est utilisé dans un ou plusieurs parcours publiés."
      })
      return response.redirect().back()
    }

    // Créer la demande de suppression
    await CourseDeletionRequest.create({
      courseId: course.id,
      userId: user.id,
      reason: request.input('reason') || null
    })

    session.flash('notification', {
      type: 'success',
      message: "✅ Votre demande de suppression a été envoyée à l'administrateur. Elle sera traitée prochainement."
    })
    return response.redirect().back()
  }

  /**
   * Delete a course
   */
  async destroy({ params, auth, response, session }: HttpContext) {
    const course = await Course.findOrFail(params.id)
    if (course.userId !== auth.user!.id) {
      session.flash('notification', { type: 'error', message: 'Non autorisé' })
      return response.redirect().back()
    }
    await course.delete()
    session.flash('notification', { type: 'success', message: 'Supprimé' })
    return response.redirect().back()
  }

  async syncLocalContent({ params, request, response, auth }: HttpContext) {
    const course = await Course.findOrFail(params.id)
    if (course.userId !== auth.user!.id) return response.unauthorized()

    const contentSchema = vine.object({
      content: vine.object({
        description: vine.string().trim().minLength(10),
        level: vine.string().trim().optional(),
        image: vine.string().url().optional(),
        sources: vine.array(vine.string()).optional(),
        modules: vine.array(vine.object({
          title: vine.string().trim(),
          lessons: vine.array(vine.object({
            title: vine.string().trim(),
            content: vine.string().trim(),
            video_url: vine.string().trim().optional(),
            audio_url: vine.string().trim().optional()
          })),
          exercises: vine.array(vine.string()).optional(),
          flashcards: vine.array(vine.object({ question: vine.string().trim(), answer: vine.string().trim() })).optional(),
          quiz: vine.array(vine.object({
            question: vine.string().trim(),
            options: vine.array(vine.string()),
            answer: vine.string().trim(),
            explanation: vine.string().trim().optional()
          })).optional()
        }))
      })
    })

    try {
      const data = await vine.validate({ schema: contentSchema, data: request.all() })

      // Vérifier et corriger l'image si nécessaire avant la sauvegarde
      const fixedImage = await this.verifyAndFixImage(data.content.image || '', course.title)
      data.content.image = fixedImage

      course.description = data.content.description
      course.content = data.content
      course.status = 'ready'
      await course.save()
      return response.ok({ status: 'success' })
    } catch (error) {
      return response.badRequest({ message: 'Format invalide', errors: error.messages })
    }
  }
}