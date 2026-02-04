import { BaseCommand } from '@adonisjs/core/ace'
import LearningPath from '#models/learning_path'
import SharedLearningPath from '#models/shared_learning_path'
import db from '@adonisjs/lucid/services/db'

export default class CleanupDuplicates extends BaseCommand {
  static commandName = 'cleanup:duplicates'
  static description = 'Nettoie les cours et parcours dupliqués par l\'ancien système d\'importation'
  static options = {
    startApp: true,
  }

  async run() {
    this.logger.info('🚀 Démarrage du nettoyage des doublons...')

    // --- 1. NETTOYAGE DES PARCOURS EN DOUBLON (MÊME ORIGE ET MÊME UTILISATEUR) ---
    this.logger.info('Vérification des parcours importés plusieurs fois par le même utilisateur...')

    const multipleImports = await db
      .from('learning_paths')
      .select('user_id', 'origin_shared_path_id')
      .whereNotNull('origin_shared_path_id')
      .groupBy('user_id', 'origin_shared_path_id')
      .having(db.raw('count(*)'), '>', 1)

    for (const row of multipleImports) {
      const paths = await LearningPath.query()
        .where('userId', row.user_id)
        .where('originSharedPathId', row.origin_shared_path_id)
        .orderBy('createdAt', 'desc')

      const toDelete = paths.slice(1)
      for (const p of toDelete) {
        this.logger.info(`  Suppression du parcours en triple (ID identique): ${p.title} (ID: ${p.id})`)
        await p.delete()
      }
    }

    // --- 1b. SUPPRESSION DES PARCOURS VIDES ---
    this.logger.info('Vérification des parcours vides (0 cours)...')
    const allPaths = await LearningPath.query().preload('courses')
    for (const p of allPaths) {
      if (p.courses.length === 0) {
        this.logger.info(`  Suppression du parcours vide: ${p.title} (ID: ${p.id})`)
        await p.delete()
      }
    }

    // --- 1c. SUPPRESSION DES DOUBLONS PAR TITRE (MÊME UTILISATEUR) ---
    this.logger.info('Vérification des doublons par titre pour le même utilisateur...')

    const titleDuplicates = await db
      .from('learning_paths')
      .select('user_id', 'title')
      .groupBy('user_id', 'title')
      .having(db.raw('count(*)'), '>', 1)

    for (const row of titleDuplicates) {
      const paths = await LearningPath.query()
        .where('userId', row.user_id)
        .where('title', row.title)
        .preload('courses')
        .orderBy('createdAt', 'desc')

      // On garde celui qui a le plus de cours, ou le plus récent
      paths.sort((a, b) => b.courses.length - a.courses.length || b.createdAt.toMillis() - a.createdAt.toMillis())

      const toDelete = paths.slice(1)
      for (const p of toDelete) {
        this.logger.info(`  Suppression du doublon par titre: ${p.title} (ID: ${p.id}, Cours: ${p.courses.length})`)
        await p.delete()
      }
    }

    // --- 1d. NETTOYAGE DES PARTAGES COMMUNAUTÉ EN DOUBLON ---
    this.logger.info('Vérification des partages communautaires en doublon...')

    const sharedDuplicates = await db
      .from('shared_learning_paths')
      .select('learning_path_id', 'user_id')
      .groupBy('learning_path_id', 'user_id')
      .having(db.raw('count(*)'), '>', 1)

    for (const row of sharedDuplicates) {
      const shares = await SharedLearningPath.query()
        .where('learningPathId', row.learning_path_id)
        .where('userId', row.user_id)
        .orderBy('createdAt', 'desc')

      const toDelete = shares.slice(1)
      for (const s of toDelete) {
        this.logger.info(`  Suppression du partage communautaire en doublon (ID: ${s.id})`)
        await s.delete()
      }
    }

    // --- 1e. SUPPRESSION DES PARTAGES POINTANT VERS DES PARCOURS INVALIDES ---
    this.logger.info('Vérification des partages pointant vers des parcours invalides...')
    const allShares = await SharedLearningPath.query().preload('learningPath', (q) => q.preload('courses'))
    for (const s of allShares) {
      if (!s.learningPath || s.learningPath.courses.length === 0) {
        this.logger.info(`  Suppression du partage sans parcours ou parcours vide: ${s.title} (ID: ${s.id})`)
        await s.delete()
      }
    }

    // --- 2. RÉ-ASSOCIATION DES COURS ET FUSION DES PROGRESSIONS ---
    const importedPaths = await LearningPath.query()
      .whereNotNull('originSharedPathId')
      .preload('courses')

    for (const path of importedPaths) {
      const originSharedPathId = path.originSharedPathId
      if (!originSharedPathId) continue

      const sharedPath = await SharedLearningPath.query()
        .where('id', originSharedPathId)
        .preload('learningPath', (q) => q.preload('courses'))
        .first()

      if (!sharedPath || !sharedPath.learningPath) continue

      const originalCourses = sharedPath.learningPath.courses
      const importedCourses = path.courses
      const ownerId = path.userId
      if (!ownerId) continue

      for (const importedCourse of importedCourses) {
        const original = originalCourses.find(oc =>
          importedCourse.title === oc.title ||
          importedCourse.slug === oc.slug ||
          importedCourse.slug.startsWith(oc.slug)
        )

        if (original && original.id !== importedCourse.id) {
          // A. TRANSFÉRER LA PROGRESSION
          try {
            const existingProgress = await db.from('course_progresses')
              .where('user_id', ownerId)
              .where('course_id', original.id)
              .first()

            if (!existingProgress) {
              await db.from('course_progresses')
                .where('user_id', ownerId)
                .where('course_id', importedCourse.id)
                .update({ course_id: original.id })
            } else {
              await db.from('course_progresses')
                .where('user_id', ownerId)
                .where('course_id', importedCourse.id)
                .delete()
            }
          } catch (e) { }

          // B. TRANSFÉRER LES FAVORIS
          try {
            const existingBookmark = await db.from('bookmarks')
              .where('user_id', ownerId)
              .where('course_id', original.id)
              .first()

            if (!existingBookmark) {
              await db.from('bookmarks')
                .where('user_id', ownerId)
                .where('course_id', importedCourse.id)
                .update({ course_id: original.id })
            } else {
              await db.from('bookmarks')
                .where('user_id', ownerId)
                .where('course_id', importedCourse.id)
                .delete()
            }
          } catch (e) { }

          // C. METTRE À JOUR LE LIEN DANS LE PARCOURS (PIVOT TABLE)
          // On vérifie d'abord si le cours original est déjà présent dans ce parcours
          const alreadyLinked = await db.from('learning_path_courses')
            .where('learning_path_id', path.id)
            .where('course_id', original.id)
            .first()

          if (!alreadyLinked) {
            await db.from('learning_path_courses')
              .where('learning_path_id', path.id)
              .where('course_id', importedCourse.id)
              .update({ course_id: original.id })
          } else {
            // Si l'original et le duplicata étaient tous deux dans le parcours, on supprime le lien du duplicata
            await db.from('learning_path_courses')
              .where('learning_path_id', path.id)
              .where('course_id', importedCourse.id)
              .delete()
          }

          // D. SUPPRIMER LE COURS DUPLICATA S'IL N'EST PLUS UTILISÉ
          const usage = await db.from('learning_path_courses')
            .where('course_id', importedCourse.id)
            .count('* as total')

          if (Number((usage[0] as any).total) === 0) {
            await importedCourse.delete()
          }
        }
      }
    }

    this.logger.success('✨ Nettoyage terminé avec succès !')
  }
}
