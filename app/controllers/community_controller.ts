import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import User from '#models/user'
import Course from '#models/course'
import LearningPath from '#models/learning_path'
import SharedLearningPath from '#models/shared_learning_path'

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

    return response.json({ sharedPaths })
  }

  /**
   * Show a specific shared path
   */
  async show({ params, response, view }: HttpContext) {
    const { token } = params

    const sharedPath = await SharedLearningPath.query()
      .where('shareToken', token)
      .preload('user')
      .preload('learningPath', (query) => {
        query.preload('courses')
      })
      .first()

    if (!sharedPath) {
      return response.status(404).send('Parcours non trouvé')
    }

    if (sharedPath.isExpired()) {
      return response.status(410).send('Parcours expiré')
    }

    // Stats
    sharedPath.viewsCount++
    await sharedPath.save()

    return view.render('pages/community/show', { sharedPath })
  }

  /**
   * Share a learning path
   */
  async share({ request, response, auth }: HttpContext) {
    const user = auth.user! as User
    const { learningPathId, title, description, isPublic } = request.all()

    // Vérifier que le parcours appartient bien à l'utilisateur
    const learningPath = await LearningPath.query()
      .where('id', learningPathId)
      .where('userId', user.id)
      .first()

    if (!learningPath) {
      return response.status(403).json({ error: "Vous ne pouvez partager que vos propres parcours." })
    }

    const shareToken = SharedLearningPath.generateShareToken()

    const sharedPath = await SharedLearningPath.create({
      userId: user.id,
      learningPathId,
      shareToken,
      title,
      description,
      isPublic: isPublic === 'on' || isPublic === true,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now()
    })

    return response.json({
      success: true,
      shareUrl: `/community/shared/${shareToken}`,
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
      difficulty: sharedPath.learningPath.difficulty
    })

    const newCourses: number[] = []

    // Duplicate each course for the user
    for (const originalCourse of sharedPath.learningPath.courses) {
      // Check if user already has an identical course (same slug) to avoid duplicates
      // Actually, we want them to have these courses LINKED to the path, 
      // even if they already have them elsewhere. But to be safe with DB constraints:
      let targetCourseId: number

      const exists = await user.related('courses').query().where('slug', originalCourse.slug).first()

      if (exists) {
        targetCourseId = exists.id
      } else {
        // Generate a unique slug for the user to avoid global UNIQUE constraint collision
        let newSlug = originalCourse.slug
        let counter = 1
        while (await user.related('courses').query().where('slug', newSlug).first() || await Course.findBy('slug', newSlug)) {
          newSlug = `${originalCourse.slug}-${Math.random().toString(36).substring(2, 7)}`
          counter++
          if (counter > 10) break
        }

        const newCourse = await user.related('courses').create({
          title: originalCourse.title,
          slug: newSlug,
          description: originalCourse.description,
          content: originalCourse.content,
          status: 'ready',
          categoryId: originalCourse.categoryId,
          topicTag: originalCourse.topicTag,
        })
        targetCourseId = newCourse.id
      }
      newCourses.push(targetCourseId)
    }

    // Attach courses to the new path
    if (newCourses.length > 0) {
      const pivotData: any = {}
      newCourses.forEach((id, index) => {
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
