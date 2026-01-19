import type { HttpContext } from '@adonisjs/core/http'
import Course from '#models/course'
import Category from '#models/category'
import GeminiService from '#services/gemini_service'
import OllamaService from '#services/ollama_service'
import string from '@adonisjs/core/helpers/string'
import User from '#models/user'
import GuestAccess from '#models/guest_access'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Bookmark from '#models/bookmark'
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
  async show({ params, view, auth, request, response, session }: HttpContext) {
    await auth.check()
    const course = await Course.findBy('slug', params.slug)

    if (!course) {
      session.flash('notification', { type: 'error', message: 'Ce cours n\'existe pas ou a été supprimé.' })
      return response.redirect('/')
    }

    // Logique de restriction pour les invités (non connectés)
    if (!auth.user) {
      const ip = request.ip()
      const startOfMonth = DateTime.now().startOf('month')

      // Vérifier si l'invité a déjà un accès ce mois-ci
      const access = await GuestAccess.query()
        .where('ipAddress', ip)
        .where('createdAt', '>=', startOfMonth.toSQL())
        .first()

      if (access) {
        // S'il a déjà un accès, il ne peut voir QUE ce cours là
        if (access.courseId !== course.id) {
          session.flash('notification', {
            type: 'error',
            message: "Accès limité ! Vous suivez déjà un cours gratuit ce mois-ci. Inscrivez-vous gratuitement pour débloquer tous les cours !"
          })
          return response.redirect().toPath('/parcourir')
        }
      } else {
        // Pas encore d'accès ce mois-ci : Vérifier la confirmation
        const confirmed = request.input('confirm_guest_access') === '1'

        if (!confirmed) {
          // Afficher la page d'avertissement / confirmation
          return view.render('pages/courses/guest_warning', { course })
        }

        // Créer l'accès
        await GuestAccess.create({
          ipAddress: ip,
          courseId: course.id
        })
      }
    }

    let completedLessons: string[] = []
    let isBookmarked = false

    if (auth.user) {
      // Update last reviewed date if owner
      if (course.userId === auth.user.id) {
        course.lastReviewedAt = DateTime.now()
        await course.save()
      }

      const progress = await auth.user.related('progress').query().where('courseId', course.id)
      completedLessons = progress.map(p => `${p.moduleTitle}|${p.lessonTitle}`)

      // Check for bookmark
      const bookmark = await Bookmark.query()
        .where('userId', auth.user.id)
        .where('courseId', course.id)
        .first()
      isBookmarked = !!bookmark
    }

    return view.render('pages/courses/show', { course, completedLessons, isBookmarked })
  }

  /**
   * Browse all courses with category filtering and search
   */
  async browse({ view, auth, request }: HttpContext) {
    await auth.check()

    const categoryId = request.input('category')
    const searchQuery = request.input('search', '').trim()
    const page = request.input('page', 1)
    const limit = 12

    let coursesQuery = Course.query().where('status', 'ready')

    // Apply category filter
    if (categoryId) {
      coursesQuery = coursesQuery.where('categoryId', categoryId)
    }

    // Apply search filter
    if (searchQuery) {
      coursesQuery = coursesQuery.andWhere((query) => {
        query.where('title', 'like', `%${searchQuery}%`)
          .orWhere('description', 'like', `%${searchQuery}%`)
      })
    }

    // Get total count for pagination
    const totalCount = await coursesQuery.clone().count('* as total').then(result => result[0].$extras.total)

    // Apply pagination and preload category safely
    const courses = await coursesQuery
      .orderBy('createdAt', 'desc')
      .offset((page - 1) * limit)
      .limit(limit)
      .preload('category', (query) => {
        // Handle null categories gracefully
        query.whereRaw('categories.id IS NOT NULL OR categories.id IS NULL')
      })

    if (auth.user) await this.attachProgress(courses, auth.user as User)

    // Get all categories for the filter with course counts
    const categories = await db.from('categories')
      .leftJoin('courses', 'categories.id', 'courses.category_id')
      .select('categories.*')
      .select(db.raw('COUNT(CASE WHEN courses.status = ? THEN courses.id END) as course_count', ['ready']))
      .groupBy('categories.id')
      .orderBy('categories.name', 'asc')

    // Calculate pagination data
    const totalPages = Math.ceil(totalCount / limit)
    const hasNextPage = page < totalPages
    const hasPrevPage = page > 1

    return view.render('pages/courses/browse', {
      courses,
      categories,
      selectedCategory: categoryId,
      searchQuery,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNextPage,
        hasPrevPage,
        limit
      }
    })
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

    // 4. Bookmarks
    const bookmarks = await user.related('bookmarks').query().preload('course')
    const bookmarkedCourses = bookmarks.map(b => b.course).filter(c => c) // c is defined
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
   * Generate or Redirect to a course (with smart duplicate detection)
   */
  async generate({ request, response, auth, session }: HttpContext) {
    const topic = request.input('topic')
    const categoryId = request.input('category_id')
    const forceCreate = request.input('force_create') === 'true'

    if (!topic) {
      return response.redirect().back()
    }

    if (!auth.user) {
      console.error('[CoursesController] User not authenticated in generate method')
      return response.unauthorized('Veuillez vous connecter')
    }

    // 1. Normalisation du sujet
    const cleanTopic = topic.toLowerCase()
      .replace(/^(donne moi un cours sur|je veux apprendre|apprendre|tout savoir sur|cours sur)\s+/i, '')
      .trim()

    const baseSlug = string.slug(cleanTopic).toLowerCase()

    // 2. Recherche EXACTE par slug (pour redirection intelligente)
    let exactCourse = await Course.findBy('slug', baseSlug)
    if (exactCourse && exactCourse.status !== 'error') {
      return response.redirect().toPath(`/courses/${exactCourse.slug}`)
    }

    // 3. Gestion de l'unicité du slug pour la CRÉATION
    let slug = baseSlug
    let counter = 1
    while (await Course.findBy('slug', slug)) {
      slug = `${baseSlug}-${counter}`
      counter++
    }

    // 3. Recherche INTELLIGENTE de cours similaires (si pas de forçage)
    if (!forceCreate) {
      // Mots génériques à ignorer (stopwords)
      const stopwords = [
        'cours', 'formation', 'apprendre', 'apprentissage', 'sur', 'en', 'de', 'le', 'la', 'les',
        'un', 'une', 'des', 'du', 'pour', 'avec', 'par', 'dans', 'tout', 'savoir', 'guide',
        'complet', 'débutant', 'expert', 'niveau', 'initiation', 'introduction', 'bases'
      ]

      // Extraire les VRAIS mots-clés (techniques)
      const keywords = cleanTopic
        .split(/\s+/)
        .filter((w: string) => w.length > 2)
        .filter((w: string) => !stopwords.includes(w.toLowerCase()))
        .map((w: string) => w.toLowerCase())

      // Si aucun mot-clé pertinent, ne pas chercher de similaires
      if (keywords.length === 0) {
        // Pas de mots-clés techniques, on crée directement
      } else {
        const similarCourses = await Course.query()
          .where('status', 'ready')
          .andWhere((query) => {
            // Chercher les cours qui contiennent TOUS les mots-clés (ET logique)
            keywords.forEach((keyword: string) => {
              query.andWhere((subQuery) => {
                subQuery.where('title', 'like', `%${keyword}%`)
                  .orWhere('slug', 'like', `%${keyword}%`)
              })
            })
          })
          .limit(5)

        if (similarCourses.length > 0) {
          // Stocker dans la session (pas flash car on redirige)
          session.put('pendingTopic', cleanTopic)
          session.put('pendingCategoryId', categoryId)
          session.put('similarCourses', similarCourses.map(c => ({ id: c.id, title: c.title, slug: c.slug, description: c.description })))
          return response.redirect().toRoute('courses.confirm')
        }
      }
    }

    // 4. Créer le cours (aucun similaire trouvé OU création forcée)
    const course = await Course.create({
      title: cleanTopic.charAt(0).toUpperCase() + cleanTopic.slice(1),
      slug,
      status: 'generating',
      userId: auth.user.id,
      categoryId: categoryId || null
    })

    // Auto-categorize if no category was selected
    if (!categoryId) {
      try {
        const suggestedCategory = await this.categorizeCourseWithAI(course.title)
        if (suggestedCategory) {
          course.categoryId = suggestedCategory.id
          await course.save()
          console.log(`[CoursesController] Auto-categorized "${course.title}" to "${suggestedCategory.name}"`)
        }
      } catch (error) {
        console.error('[CoursesController] Auto-categorization failed:', error)
      }
    }

    const user = auth.user as User
    this.generateCourseContent(course, user).catch(err => {
      console.error('[CoursesController] generateCourseContent async failure:', err)
    })

    return response.redirect().toPath(`/courses/${course.slug}`)
  }

  /**
   * Show confirmation page when similar courses are found
   */
  async confirm({ view, session, response }: HttpContext) {
    const pendingTopic = session.get('pendingTopic')
    const pendingCategoryId = session.get('pendingCategoryId')
    const similarCourses = session.get('similarCourses') || []

    if (!pendingTopic) {
      return response.redirect('/')
    }

    // Nettoyer la session après lecture
    session.forget('pendingTopic')
    session.forget('pendingCategoryId')
    session.forget('similarCourses')

    return view.render('pages/courses/confirm', {
      pendingTopic,
      pendingCategoryId,
      similarCourses
    })
  }

  /**
   * Automatic categorization using AI
   */
  private async categorizeCourseWithAI(courseTitle: string): Promise<Category | null> {
    try {
      // Get existing categories for context
      const existingCategories = await Category.query().orderBy('name', 'asc')

      if (existingCategories.length === 0) {
        // Create default categories if none exist
        await this.createDefaultCategories()
        const categories = await Category.query().orderBy('name', 'asc')
        return await this.selectBestCategory(courseTitle, categories)
      }

      return await this.selectBestCategory(courseTitle, existingCategories)
    } catch (error) {
      console.error('[CoursesController] Error in categorizeCourseWithAI:', error)
      return null
    }
  }

  /**
   * Create default categories for the platform
   */
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
      const slug = string.slug(cat.name).toLowerCase()
      await Category.create({
        name: cat.name,
        slug,
        icon: cat.icon,
        color: cat.color
      })
    }
  }

  /**
   * Select the best category for a course title using AI
   */
  private async selectBestCategory(courseTitle: string, categories: Category[]): Promise<Category | null> {
    if (categories.length === 0) return null

    try {
      // Simple keyword-based categorization as fallback
      const title = courseTitle.toLowerCase()

      // Web development keywords
      if (title.match(/javascript|react|vue|angular|html|css|php|python|node|web|site|application|code|programming|développement|programmation/)) {
        const webCat = categories.find(c => c.name.toLowerCase().includes('web') || c.name.toLowerCase().includes('développement'))
        if (webCat) return webCat
      }

      // Design keywords
      if (title.match(/design|ui|ux|figma|photoshop|illustrator|créatif|graphique|visuel/)) {
        const designCat = categories.find(c => c.name.toLowerCase().includes('design') || c.name.toLowerCase().includes('créativ'))
        if (designCat) return designCat
      }

      // Marketing keywords
      if (title.match(/marketing|business|vente|commerce|stratégie|entrepreneur|seo|social|réseaux/)) {
        const marketingCat = categories.find(c => c.name.toLowerCase().includes('marketing') || c.name.toLowerCase().includes('business'))
        if (marketingCat) return marketingCat
      }

      // Science keywords
      if (title.match(/science|physique|chimie|biologie|technologie|ia|intelligence|robot|data|analyse/)) {
        const scienceCat = categories.find(c => c.name.toLowerCase().includes('science') || c.name.toLowerCase().includes('technologie'))
        if (scienceCat) return scienceCat
      }

      // Language keywords
      if (title.match(/langue|anglais|français|espagnol|communication|parler|apprendre.*langue|traduction/)) {
        const langCat = categories.find(c => c.name.toLowerCase().includes('langue') || c.name.toLowerCase().includes('communication'))
        if (langCat) return langCat
      }

      // Math keywords
      if (title.match(/math|mathématique|calcul|algèbre|géométrie|statistique|logique|probabilité/)) {
        const mathCat = categories.find(c => c.name.toLowerCase().includes('math') || c.name.toLowerCase().includes('logique'))
        if (mathCat) return mathCat
      }

      // Art keywords
      if (title.match(/art|musique|peinture|dessin|culture|histoire|littérature|cinéma/)) {
        const artCat = categories.find(c => c.name.toLowerCase().includes('art') || c.name.toLowerCase().includes('culture'))
        if (artCat) return artCat
      }

      // Health keywords
      if (title.match(/santé|médecine|sport|fitness|bien-être|nutrition|psychologie|thérapie/)) {
        const healthCat = categories.find(c => c.name.toLowerCase().includes('santé') || c.name.toLowerCase().includes('bien'))
        if (healthCat) return healthCat
      }

      // If no match, return the first category or create a new one
      return categories[0]
    } catch (error) {
      console.error('[CoursesController] Error in selectBestCategory:', error)
      return categories[0] || null
    }
  }

  private async generateCourseContent(course: Course, user: User) {
    console.log(`[CoursesController] Starting generation for "${course.title}" for user ${user.email} (Model: ${user.aiModel}, Provider: ${user.aiProvider})`)
    try {
      let content;
      let prompt = '';

      if (user.aiProvider === 'ollama') {
        // --- PROMPT OLLAMA (ILLIMITÉ & COMPLET) ---
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
          "image": "URL Unsplash",
          "sources": ["Source 1 (ex: MDN Web Docs)", "Source 2"],
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

        content = await OllamaService.generateJson(prompt, user.aiModel || 'llama3')

      } else {
        // --- PROMPT GEMINI (OPTIMISÉ QUOTA GRATUIT) ---
        prompt = `Sujet: "${course.title}".
        Génère un cours structuré (JSON).
        Objectif: Synthétique & Percutant (Format "Flash Course").
        Structure: MAX 3 Modules, MAX 2 Leçons par module. 1 Quiz par module.
        Contenu: Essentiel uniquement (env. 200 mots/leçon).
        Format JSON STRICT (Attention: échappe les " par \\" à l'intérieur des textes, ou utilise des ' pour le code) :
        {
          "description": "Description courte",
          "level": "Intermédiaire",
          "image": "URL Unsplash",
          "sources": ["Source fiable 1", "Source fiable 2"],
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

        content = await GeminiService.generateJson(prompt, user.aiModel || 'gemini-flash-latest')
      }

      course.description = content.description || ""

      // --- Image Validation & Recovery Verification ---
      console.log(`[CoursesController] Verifying image: ${content.image}`)
      content.image = await this.verifyAndFixImage(content.image, course.title)

      course.content = content
      course.status = 'ready'
      await course.save()
    } catch (error) {
      console.error('[CoursesController] GENERATION ERROR:', error)
      try {
        const fs = await import('node:fs')
        const logContent = `Topic: ${course.title}\nUser: ${user.email}\nError: ${error.message}\nStack: ${error.stack}\n`
        fs.appendFileSync('generation_debug.log', logContent)
      } catch (e) {
        console.error('Failed to write debug log:', e)
      }

      course.status = 'error'
      await course.save()
    }
  }

  /**
   * Verify image URL and try to fix it if broken
   */
  private async verifyAndFixImage(url: string, topic: string): Promise<string> {
    const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1600&auto=format&fit=crop&q=80'

    // Helper to check if a URL is a valid image
    const isImageAccessible = async (testUrl: string) => {
      try {
        if (!testUrl || testUrl.length < 5) return false
        // Fetch with a short timeout to avoid hanging
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        const response = await fetch(testUrl, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'User-Agent': 'MyProfessorApp/1.0' } // Useful for some CDNs
        })

        clearTimeout(timeoutId)

        if (!response.ok) return false
        const contentType = response.headers.get('content-type')
        return contentType && contentType.startsWith('image/')
      } catch (e) {
        return false
      }
    }

    // 1. Test original URL
    if (await isImageAccessible(url)) {
      return url
    }
    console.log('[CoursesController] Original image invalid, regenerating...')

    // 2. Try Pollinations
    try {
      const cleanTopic = topic.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 100)
      const newUrl = `https://image.pollinations.ai/prompt/minimalist%20educational%20illustration%20for%20${encodeURIComponent(cleanTopic)}?nologo=true`

      if (await isImageAccessible(newUrl)) {
        console.log(`[CoursesController] New image generated: ${newUrl}`)
        return newUrl
      }
    } catch (e) {
      console.error('[CoursesController] Regeneration check failed')
    }

    // 3. Fallback
    console.log('[CoursesController] Using default fallback image')
    return DEFAULT_IMAGE
  }

  /**
   * Toggle bookmark for a course
   */
  async toggleBookmark({ params, auth, response, session }: HttpContext) {
    await auth.check()
    const user = auth.user!
    const courseId = params.id

    const existingBookmark = await Bookmark.query()
      .where('userId', user.id)
      .where('courseId', courseId)
      .first()

    if (existingBookmark) {
      await existingBookmark.delete()
      // Return JSON if it's an AJAX request, otherwise redirect
      return response.json({ status: 'removed', message: 'Retiré des favoris' })
    } else {
      await Bookmark.create({
        userId: user.id,
        courseId
      })
      return response.json({ status: 'added', message: 'Ajouté aux favoris' })
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