import type { HttpContext } from '@adonisjs/core/http'
import Course from '#models/course'
import Category from '#models/category'
import CourseDeletionRequest from '#models/course_deletion_request'
import AiProviderService from '#services/ai_provider_service'
import string from '@adonisjs/core/helpers/string'
import User from '#models/user'
import GuestAccess from '#models/guest_access'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Bookmark from '#models/bookmark'
import vine from '@vinejs/vine'
import PodcastService from '#services/podcast_service'

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
      let ip = request.ip()
      let guestId = request.cookie('guest_id')
      const userAgent = request.header('user-agent') || null

      // Vérifier si l'IP est une IP privée (Docker, LAN, Localhost)
      const isPrivateIp = (addr: string) => {
        return addr === '127.0.0.1' || addr === '::1' ||
          addr.startsWith('10.') ||
          addr.startsWith('192.168.') ||
          (addr.startsWith('172.') && parseInt(addr.split('.')[1]) >= 16 && parseInt(addr.split('.')[1]) <= 31)
      }

      const ipIsUnreliable = isPrivateIp(ip)

      if (!guestId) {
        guestId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
        response.cookie('guest_id', guestId, {
          maxAge: '1 year',
          httpOnly: true,
          sameSite: 'lax'
        })
      }

      const startOfMonth = DateTime.now().startOf('month')

      // Vérifier si cet utilisateur a déjà accédé à un cours ce mois-ci
      // Si l'IP est privée/interne, on se base UNIQUEMENT sur le guestId
      const access = await GuestAccess.query()
        .where((query) => {
          if (ipIsUnreliable) {
            query.where('guestId', guestId!)
          } else {
            query.where('ipAddress', ip).orWhere('guestId', guestId!)
          }
        })
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

        // Récupérer les infos géo (Uniquement si l'IP est publique)
        let geo: any = null
        if (!ipIsUnreliable) {
          try {
            const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city`)
            if (geoRes.ok) {
              geo = await geoRes.json()
            }
          } catch (e) {
            console.error('[GeoIP] Error:', e)
          }
        }

        await GuestAccess.create({
          ipAddress: ip,
          guestId,
          userAgent,
          courseId: course.id,
          country: geo?.status === 'success' ? geo.country : (ipIsUnreliable ? 'Local/Network' : null),
          countryCode: geo?.status === 'success' ? geo.countryCode : null,
          city: geo?.status === 'success' ? geo.city : null
        })
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

    // 1. Get owned courses
    const ownedCourses = await user.related('courses').query().orderBy('createdAt', 'desc')

    // 2. Get courses from user's learning paths (including imported ones)
    const userPaths = await user.related('learningPaths').query().preload('courses')
    const coursesFromPaths = userPaths.flatMap((p) => p.courses)

    // 3. Merge and deduplicate
    const allCoursesMap = new Map<number, Course>()
    ownedCourses.forEach((c) => allCoursesMap.set(c.id, c))
    coursesFromPaths.forEach((c) => {
      if (!allCoursesMap.has(c.id)) {
        allCoursesMap.set(c.id, c)
      }
    })

    const courses = Array.from(allCoursesMap.values()).sort(
      (a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()
    )

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
      bookmarkedCourses,
      userPaths
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
        const suggestedCategory = await this.categorizeCourseWithAI(course.title, auth.user as User)
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
    const prompt = `Task: Extract the core academic subject or technology from this request. 
    Request: "${userPrompt}"
    Rules: 
    - Output ONLY the subject name (1-3 words).
    - No punctuation.
    - No verbs like "Learn" or "Course about".
    - Correct capitalization.
    Example: "I want to learn programming in python for data science" -> "Python Data Science"
    Result:`

    try {
      const tag = await AiProviderService.generateText(prompt, user)
      return tag.trim().replace(/^['"]|['"]$/g, '').replace(/\.$/, '') || string.slug(userPrompt)
    } catch (e) {
      console.error('[extractTopicWithAI] Error:', e)
      return string.slug(userPrompt)
    }
  }

  private async categorizeCourseWithAI(courseTitle: string, user: User): Promise<Category | null> {
    const existingCats = await Category.query().select('name').orderBy('name', 'asc')
    const existingNames = existingCats.map(c => c.name).join('", "')

    const prompt = `Task: Categorize this course title into a single broad category.
    Title: "${courseTitle}"
    Existing categories you SHOULD reuse if they fit: "${existingNames}".
    Rule: Output ONLY the category name. If none fit, create a new short category name (1-2 words).
    Constraint: Re-use an existing category if it's even remotely related (e.g., if you have "Programming", don't create "Coding").
    Result:`

    try {
      const categoryName = await AiProviderService.generateText(prompt, user)
      const cleanName = categoryName.trim().replace(/^['"]|['"]$/g, '').replace(/\.$/, '')
      const slug = string.slug(cleanName).toLowerCase()

      // Find by slug (most reliable for duplicates like "Programmation" vs "programmation")
      let category = await Category.findBy('slug', slug)

      // Secondary check: search for similar name (case insensitive)
      if (!category) {
        category = await Category.query()
          .whereILike('name', cleanName)
          .first()
      }

      if (!category) {
        category = await Category.create({
          name: cleanName,
          slug: slug,
          icon: '📁',
          color: '#6366f1'
        })
      }
      return category
    } catch (e) {
      console.error('[categorizeCourseWithAI] Error:', e)
      const categories = await Category.query().orderBy('name', 'asc')
      if (categories.length === 0) {
        await this.createDefaultCategories()
        const newCats = await Category.query().orderBy('name', 'asc')
        return await this.selectBestCategory(courseTitle, newCats)
      }
      return await this.selectBestCategory(courseTitle, categories)
    }
  }

  private async createDefaultCategories(): Promise<void> {
    const defaultCategories = [
      { name: 'Programmation', icon: '💻', color: '#3b82f6' },
      { name: 'Design', icon: '🎨', color: '#ec4899' },
      { name: 'Marketing', icon: '📈', color: '#10b981' },
      { name: 'Sciences', icon: '🔬', color: '#8b5cf6' },
      { name: 'Langues', icon: '🗣️', color: '#f59e0b' },
      { name: 'Mathématiques', icon: '🧮', color: '#ef4444' }
    ]
    for (const cat of defaultCategories) {
      const slug = string.slug(cat.name).toLowerCase()
      const existing = await Category.findBy('slug', slug)
      if (!existing) {
        await Category.create({ name: cat.name, slug, icon: cat.icon, color: cat.color })
      }
    }
  }

  private async selectBestCategory(courseTitle: string, categories: Category[]): Promise<Category | null> {
    const title = courseTitle.toLowerCase()
    if (title.match(/javascript|react|vue|angular|html|css|php|python|node|ruby|web|site|application|ui|ux|frontend|backend/)) {
      return categories.find(c => c.slug.includes('prog') || c.slug.includes('web')) || categories[0]
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
        "image": "english keywords for a professional cover image (ex: 'rust programming language', 'vintage typewriter')",
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
        "image": "english keywords for a cover image (ex: 'data science', 'vintage computer')",
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
                "question": "Question sur ce module ?",
                "options": ["Choix A", "Choix B", "Choix C", "Choix D"],
                "answer": "Choix A",
                "explanation": "Explication pédagogique détaillée de pourquoi cette réponse est la bonne."
              }
            ]
          }
        ]
      }`;
      }

      const content = await AiProviderService.generateJson(prompt, user)

      course.description = content.description || ""
      content.image = await CoursesController.verifyAndFixImage(content.image, course.title)
      course.content = content
      course.status = 'ready'
      await course.save()

      // Lancement de la génération du podcast en arrière-plan (Premium)
      PodcastService.generatePodcast(course, user).catch(e => console.error('Podcast gen failed', e))

    } catch (error: any) {
      console.error('[CoursesController] Generation failure:', error)
      course.status = 'error'
      course.errorMessage = error.message || 'Une erreur inconnue est survenue lors de la génération.'
      await course.save()
    }
  }

  public static async verifyAndFixImage(url: string, topic: string): Promise<string> {
    const isImageAccessible = async (testUrl: string) => {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 3000)
        const res = await fetch(testUrl, { method: 'HEAD', signal: controller.signal })
        clearTimeout(timeoutId)
        return res.ok && res.headers.get('content-type')?.startsWith('image/')
      } catch { return false }
    }

    // 1. Check if the provided URL is already valid
    if (url && url.startsWith('http')) {
      if (await isImageAccessible(url)) return url
      // If broken link, ignore it for generation
      url = ''
    }

    let keywords = url || topic
    keywords = keywords.replace(/^mots-clés pour.*?:/i, '')
      .replace(/['"]/g, '')
      .trim()

    // Fallback to topic if keywords ended up empty
    if (!keywords || keywords.length < 2) keywords = topic

    const encodedKeywords = encodeURIComponent(keywords)

    // 2. Try Pollinations AI
    const pollinationsUrl = `https://image.pollinations.ai/prompt/professional high quality cover for ${encodedKeywords}, 4k, cinematic?width=1200&height=630&nologo=true`
    if (await isImageAccessible(pollinationsUrl)) {
      return pollinationsUrl
    }

    // 3. Try LoremFlickr (simple, reliable fallback)
    const loremUrl = `https://loremflickr.com/800/600/${encodedKeywords}`
    if (await isImageAccessible(loremUrl)) {
      return loremUrl
    }

    // 4. Last resort: UI Avatars (text-based placeholder)
    // ALWAYS use the topic (course title) for the text, NOT the keywords which might be a long prompt or URL
    const encodedTopic = encodeURIComponent(topic)
    return `https://ui-avatars.com/api/?name=${encodedTopic}&background=random&size=512&font-size=0.33`
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
    const user = auth.user! as User

    if (course.userId !== user.id) {
      session.flash('notification', { type: 'error', message: 'Non autorisé' })
      return response.redirect().back()
    }

    // Protection: check if other users are using this course via learning paths
    const usage = await db
      .from('learning_path_courses')
      .join('learning_paths', 'learning_path_courses.learning_path_id', 'learning_paths.id')
      .where('learning_path_courses.course_id', course.id)
      .whereNot('learning_paths.user_id', user.id)
      .count('* as total')

    const isUsedByOthers = Number((usage[0] as any).total) > 0

    if (isUsedByOthers) {
      // If used by others, we don't delete it, we just orphan it from the current owner
      course.userId = null
      await course.save()
      session.flash('notification', {
        type: 'success',
        message: 'Cours retiré de votre bibliothèque (conservé car utilisé par d\'autres utilisateurs).',
      })
    } else {
      // No one else is using it, safe to delete
      await course.delete()
      session.flash('notification', { type: 'success', message: 'Cours supprimé définitivement.' })
    }

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
      const fixedImage = await CoursesController.verifyAndFixImage(data.content.image || '', course.title)
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

  /**
   * Edit course page
   */
  async edit({ params, view, auth, response }: HttpContext) {
    await auth.check()
    const course = await Course.query()
      .where('slug', params.slug)
      .where('userId', auth.user!.id)
      .preload('category')
      .first()

    if (!course) {
      return response.notFound("Cours introuvable")
    }

    const categories = await Category.all()

    return view.render('pages/courses/edit', { course, categories })
  }

  /**
   * Update course
   */
  async update({ params, request, response, auth, session }: HttpContext) {
    await auth.check()
    const course = await Course.findOrFail(params.id)

    if (course.userId !== auth.user!.id) {
      return response.unauthorized()
    }

    const title = request.input('title')
    const description = request.input('description')
    const image = request.input('image')

    course.title = title

    // Update content JSON safely
    const content = course.content || {}
    content.description = description
    content.image = image

    // Update modules if provided
    const modulesInput = request.input('modules')
    if (modulesInput && content.modules && Array.isArray(content.modules)) {
      // Handle potential object-like array from form submission
      // When submitted from form, it might be { '0': { ... }, '1': { ... } }
      const inputModulesList = Array.isArray(modulesInput) ? modulesInput : Object.values(modulesInput)

      content.modules = content.modules.map((m: any, idx: number) => {
        const inputM = inputModulesList[idx]
        if (!inputM) return m

        // Update module title
        if (inputM.title) m.title = inputM.title

        // Update lessons
        if (m.lessons && Array.isArray(m.lessons) && inputM.lessons) {
          const inputLessonsList = Array.isArray(inputM.lessons) ? inputM.lessons : Object.values(inputM.lessons)

          m.lessons = m.lessons.map((l: any, lIdx: number) => {
            const inputL = inputLessonsList[lIdx]
            if (inputL) {
              if (inputL.title) l.title = inputL.title
              if (inputL.content) l.content = inputL.content
            }
            return l
          })
        }

        // Update exercises
        if (inputM.exercises) {
          const exercisesData = Array.isArray(inputM.exercises) ? inputM.exercises : Object.values(inputM.exercises)
          m.exercises = exercisesData
            .map((e: any) => String(e)) // Ensure it's a string
            .filter((e: string) => e && e.trim() !== '')
        }

        // Update quiz
        if (inputM.quiz) {
          const quizData = Array.isArray(inputM.quiz) ? inputM.quiz : Object.values(inputM.quiz)

          m.quiz = quizData.map((q: any) => {
            const options = q.options ? (Array.isArray(q.options) ? q.options : Object.values(q.options)) : []
            return {
              question: q.question,
              options: options,
              answer: q.answer,
              explanation: q.explanation || ''
            }
          }).filter((q: any) => q.question && q.question.trim() !== '')
        }

        // Update resources
        if (inputM.resources) {
          const resData = Array.isArray(inputM.resources) ? inputM.resources : Object.values(inputM.resources)
          m.resources = resData.map((r: any) => ({
            title: r.title || 'Ressource',
            url: r.url || '#'
          })).filter((r: any) => r.url && r.url.trim() !== '' && r.url !== '#')
        }

        return m
      })
    }

    // Update sources if provided
    const sourcesInput = request.input('sources')
    if (sourcesInput) {
      const sourcesData = Array.isArray(sourcesInput) ? sourcesInput : Object.values(sourcesInput)
      content.sources = sourcesData
        .map((s: any) => String(s).trim())
        .filter((s: string) => s !== '')
    }

    course.content = content
    // Also update top-level description field if it exists and is used
    course.description = description

    // Mark as user-edited and update timestamp
    course.creationType = 'user_edited'
    course.lastEditedAt = DateTime.now()

    await course.save()

    session.flash('notification', { type: 'success', message: 'Cours mis à jour avec succès !' })
    return response.redirect().toRoute('courses.show', { slug: course.slug })
  }

  /**
   * Show manual course creation form
   */
  async create({ view, auth }: HttpContext) {
    await auth.check()
    const categories = await Category.all()
    return view.render('pages/courses/create', { categories })
  }

  /**
   * Store manually created course
   */
  async store({ request, response, auth, session }: HttpContext) {
    await auth.check()

    const data = request.only(['title', 'description', 'image', 'category_id'])
    const modulesInput = request.input('modules')

    // Build course content structure
    const modules = []
    if (modulesInput) {
      const modulesList = Array.isArray(modulesInput) ? modulesInput : Object.values(modulesInput)

      for (const moduleData of modulesList) {
        const lessons = []
        if (moduleData.lessons) {
          const lessonsList = Array.isArray(moduleData.lessons) ? moduleData.lessons : Object.values(moduleData.lessons)
          for (const lessonData of lessonsList) {
            if (lessonData.title && lessonData.content) {
              lessons.push({
                title: lessonData.title,
                content: lessonData.content
              })
            }
          }
        }

        if (moduleData.title && lessons.length > 0) {
          modules.push({
            title: moduleData.title,
            lessons: lessons,
            exercises: [],
            quiz: []
          })
        }
      }
    }

    if (modules.length === 0) {
      session.flash('notification', { type: 'error', message: 'Vous devez ajouter au moins un module avec une leçon.' })
      return response.redirect().back()
    }

    const slug = string.slug(data.title, { lower: true })

    const course = await Course.create({
      userId: auth.user!.id,
      categoryId: data.category_id || null,
      title: data.title,
      slug: slug,
      description: data.description,
      content: {
        description: data.description,
        image: data.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.title)}&background=random&size=512`,
        modules: modules,
        sources: []
      },
      status: 'ready',
      creationType: 'manual'
    })

    session.flash('notification', { type: 'success', message: 'Cours créé avec succès !' })
    return response.redirect().toRoute('courses.show', { slug: course.slug })
  }
}