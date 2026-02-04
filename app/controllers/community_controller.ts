import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import User from '#models/user'
import LearningPath from '#models/learning_path'
import SharedLearningPath from '#models/shared_learning_path'
import db from '@adonisjs/lucid/services/db'

export default class CommunityController {
  /**
   * Main community page
   */
  async index({ view }: HttpContext) {
    return view.render('pages/community/index')
  }

  /**
   * API to get public shared paths with filters
   */
  async discoverApi({ request, response }: HttpContext) {
    const { sort = 'recent', search = '', limit = 20 } = request.qs()

    let query = SharedLearningPath.query()
      .where('isPublic', true)
      .preload('user')
      .preload('learningPath', (lpQuery) => {
        lpQuery.preload('courses')
        lpQuery.preload('user')
      })

    // Search filter
    if (search) {
      query = query.where((builder) => {
        builder.where('title', 'LIKE', `%${search}%`)
          .orWhere('description', 'LIKE', `%${search}%`)
      })
    }

    // Sorting
    switch (sort) {
      case 'popular':
        query = query.orderBy('sharesCount', 'desc')
        break
      case 'views':
        query = query.orderBy('viewsCount', 'desc')
        break
      case 'recent':
      default:
        query = query.orderBy('createdAt', 'desc')
        break
    }

    const sharedPaths = await query.limit(Number(limit))

    // --- DÉDOUBLONNAGE ---
    // Si l'utilisateur est connecté, on masque les parcours déjà importés ou qu'il possède déjà
    const auth = request.ctx?.auth
    let filteredPaths = sharedPaths
    if (auth && auth.user) {
      const user = auth.user

      // Récupérer les IDs des partages originaux déjà importés
      const importedOriginIds = await db
        .from('learning_paths')
        .where('user_id', user.id)
        .whereNotNull('origin_shared_path_id')
        .select('origin_shared_path_id')
        .then(rows => rows.map(r => r.origin_shared_path_id))

      const importedSet = new Set(importedOriginIds)

      // Filtrer : 
      // 1. Masquer si sp.id est dans importedSet
      // 2. Masquer si sp.learningPath.userId est celui de l'utilisateur (il est le créateur)
      filteredPaths = sharedPaths.filter(sp => {
        const isAlreadyImported = importedSet.has(sp.id)
        const isOwner = sp.learningPath?.userId === user.id
        return !isAlreadyImported && !isOwner
      })
    }

    return response.json({ sharedPaths: filteredPaths })
  }

  /**
   * Show a specific shared path
   */
  async show({ params, response, view, session, auth }: HttpContext) {
    const { token } = params

    const sharedPath = await SharedLearningPath.query()
      .where('shareToken', token)
      .preload('user')
      .preload('learningPath', (query) => {
        query.preload('courses')
        query.preload('user')
      })
      .first()

    if (!sharedPath) {
      return response.status(404).send('Parcours non trouvé')
    }

    if (sharedPath.isExpired()) {
      return response.status(410).send('Parcours expiré')
    }

    // Stats: increment views only once per session
    const viewedPaths = session.get('viewed_shared_paths', [])
    if (!viewedPaths.includes(sharedPath.id)) {
      sharedPath.viewsCount++
      await sharedPath.save()
      viewedPaths.push(sharedPath.id)
      session.put('viewed_shared_paths', viewedPaths)
    }

    // Check if user already owns this or has imported it
    let isAlreadyOwned = false
    if (auth.user) {
      const user = auth.user
      // 1. Check if user is the original creator
      if (sharedPath.learningPath?.userId === user.id) {
        isAlreadyOwned = true
      } else {
        // 2. Check if user has already imported it
        const existingImport = await LearningPath.query()
          .where('userId', user.id)
          .where('originSharedPathId', sharedPath.id)
          .first()
        if (existingImport) {
          isAlreadyOwned = true
        }
      }
    }

    return view.render('pages/community/show', { sharedPath, isAlreadyOwned })
  }

  /**
   * Share a learning path
   */
  async share({ request, response, auth }: HttpContext) {
    const user = auth.user! as User
    const { learningPathId, title, description, isPublic } = request.all()

    if (!learningPathId) {
      return response.badRequest({ error: 'Veuillez sélectionner un parcours à partager.' })
    }

    // 1. Check if path exists first
    const learningPath = await LearningPath.find(learningPathId)

    if (!learningPath) {
      return response.status(404).json({ error: 'Parcours introuvable.' })
    }

    // 2. Check permissions
    // Admin can share anything. Users can only share their own.
    if (!user.isAdmin && learningPath.userId !== user.id) {
      console.warn(`User ${user.id} attempted to share path ${learningPath.id} owned by ${learningPath.userId}`)
      return response.status(403).json({
        error: "Vous n'avez pas la permission de partager ce parcours (propriétaire différent)."
      })
    }

    // 3. Check if already shared by this user?
    // Optionally update existing share to avoid duplicates or multiple tokens for same thing
    let sharedPath = await SharedLearningPath.query()
      .where('learningPathId', learningPath.id)
      .where('userId', user.id)
      .first()

    if (sharedPath) {
      // Update existing share
      sharedPath.merge({
        title: title || learningPath.title,
        description: description || learningPath.description,
        isPublic: isPublic === 'on' || isPublic === true,
        updatedAt: DateTime.now()
      })
      await sharedPath.save()
    } else {
      // Create new share
      const shareToken = SharedLearningPath.generateShareToken()
      sharedPath = await SharedLearningPath.create({
        userId: user.id,
        learningPathId: learningPath.id,
        shareToken,
        title: title || learningPath.title,
        description: description || learningPath.description,
        isPublic: isPublic === 'on' || isPublic === true,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now()
      })
    }

    return response.json({
      success: true,
      shareUrl: `/community/shared/${sharedPath.shareToken}`,
      sharedPath
    })
  }

  /**
   * Get my shared paths
   */
  async mySharedPaths({ auth, response }: HttpContext) {
    const user = auth.user! as User

    const sharedPaths = await SharedLearningPath.query()
      .where('userId', user.id)
      .preload('learningPath')
      .preload('user')
      .orderBy('createdAt', 'desc')

    return response.json({ sharedPaths })
  }

  /**
   * Import a shared path to my account
   */
  async import({ params, response, auth }: HttpContext) {
    const user = auth.user! as User
    const { token } = params

    const sharedPath = await SharedLearningPath.query()
      .where('shareToken', token)
      .preload('learningPath', (q) => q.preload('courses'))
      .first()

    if (!sharedPath || !sharedPath.learningPath) {
      return response.status(404).json({ error: 'Parcours non trouvé ou invalide' })
    }

    // Create the LearningPath object for the user
    const { default: string } = await import('@adonisjs/core/helpers/string')
    const baseSlug = string.slug(sharedPath.title).toLowerCase()
    let pathSlug = baseSlug
    let pathCounter = 1
    while (await LearningPath.findBy('slug', pathSlug)) {
      pathSlug = `${baseSlug}-${pathCounter}`
      pathCounter++
    }

    const newUserPath = await LearningPath.create({
      title: sharedPath.title,
      description: sharedPath.description,
      slug: pathSlug,
      userId: user.id,
      isPublished: true,
      icon: sharedPath.learningPath.icon,
      color: sharedPath.learningPath.color,
      difficulty: sharedPath.learningPath.difficulty,
      originSharedPathId: sharedPath.id
    })

    // Link original courses to the new path instead of duplicating them
    const newCourses = sharedPath.learningPath.courses.map((c) => c.id)

    // Attach courses to the new path
    if (newCourses.length > 0) {
      const pivotData: any = {}
      newCourses.forEach((id: number, index: number) => {
        pivotData[id] = { order: index }
      })
      await newUserPath.related('courses').attach(pivotData)
    }

    // Increment share count
    sharedPath.sharesCount++
    await sharedPath.save()

    return response.json({
      success: true,
      message: 'Parcours importé avec succès ! Retrouvez les cours dans votre tableau de bord.',
      redirect: '/mes-cours'
    })
  }

  /**
   * Delete a shared path
   */
  async destroy({ params, auth, response }: HttpContext) {
    const user = auth.user! as User
    const { token } = params

    const sharedPath = await SharedLearningPath.query()
      .where('shareToken', token)
      .where('userId', user.id)
      .first()

    if (!sharedPath) {
      return response.status(404).json({ error: 'Partage non trouvé ou non autorisé' })
    }

    await sharedPath.delete()
    return response.json({ success: true, message: 'Partage supprimé avec succès' })
  }

  /**
   * Update a shared path
   */
  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.user! as User
    const { token } = params
    const { title, description, isPublic } = request.all()

    const sharedPath = await SharedLearningPath.query()
      .where('shareToken', token)
      .where('userId', user.id)
      .first()

    if (!sharedPath) {
      return response.status(404).json({ error: 'Partage non trouvé ou non autorisé' })
    }

    sharedPath.merge({
      title,
      description,
      isPublic: isPublic === 'on' || isPublic === true
    })

    await sharedPath.save()

    return response.json({ success: true, message: 'Partage mis à jour !', sharedPath })
  }
}
