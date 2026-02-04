import { BaseCommand } from '@adonisjs/core/ace'
import LearningPath from '#models/learning_path'
import SharedLearningPath from '#models/shared_learning_path'
import db from '@adonisjs/lucid/services/db'

export default class CleanupDuplicates extends BaseCommand {
  static commandName = 'cleanup:duplicates'
  static description = 'Nettoie les cours et parcours dupliqués avec fusion intelligente'
  static options = {
    startApp: true,
  }

  async run() {
    this.logger.info('🚀 Démarrage du nettoyage intensif des doublons...')

    // --- 1. NETTOYAGE DES COURS DUPLIQUÉS (Fusion des données physiques) ---
    // Cette étape transforme les copies physiques de cours en références vers les originaux
    await this.mergeDuplicateCourses()

    // --- 2. FUSION DES PARCOURS IDENTIQUES (Même utilisateur ou Global) ---
    await this.mergeDuplicatePaths()

    // --- 3. NETTOYAGE FINAL ---
    await this.finalCleanup()

    this.logger.success('✨ Nettoyage terminé avec succès !')
  }

  private async mergeDuplicateCourses() {
    this.logger.info('1. Analyse et fusion des cours dupliqués...')
    const importedPaths = await LearningPath.query().whereNotNull('originSharedPathId').preload('courses')

    for (const path of importedPaths) {
      const sharedPath = await SharedLearningPath.query()
        .where('id', path.originSharedPathId!)
        .preload('learningPath', (q) => q.preload('courses'))
        .first()

      if (!sharedPath || !sharedPath.learningPath) continue

      const originalCourses = sharedPath.learningPath.courses
      const importedCourses = path.courses
      const ownerId = path.userId
      if (!ownerId) continue

      for (const importedCourse of importedCourses) {
        const original = originalCourses.find(oc =>
          importedCourse.title.toLowerCase().trim() === oc.title.toLowerCase().trim() ||
          importedCourse.slug === oc.slug
        )

        if (original && original.id !== importedCourse.id) {
          // Fusion des relations (Progress, Bookmarks, Pivot)
          await this.safelyUpdateRelation('course_progresses', { user_id: ownerId, course_id: importedCourse.id }, { course_id: original.id })
          await this.safelyUpdateRelation('bookmarks', { user_id: ownerId, course_id: importedCourse.id }, { course_id: original.id })
          await this.safelyUpdateRelation('learning_path_courses', { learning_path_id: path.id, course_id: importedCourse.id }, { course_id: original.id })

          // Delete duplicate if no longer used
          const usage = await db.from('learning_path_courses').where('course_id', importedCourse.id).count('* as total')
          if (Number((usage[0] as any).total) === 0) {
            await importedCourse.delete().catch(() => { })
          }
        }
      }
    }
  }

  private async mergeDuplicatePaths() {
    this.logger.info('2. Analyse et fusion des parcours dupliqués...')

    // On groupe par titre (normalisé)
    const titles = await db.from('learning_paths').select('title').groupBy('title').having(db.raw('count(*)'), '>', 1)

    for (const row of titles) {
      const paths = await LearningPath.query()
        .where('title', row.title)
        .preload('courses')
        .orderBy('userId', 'asc') // Admin (null) en premier

      // Tri intelligent : Admin d'abord, puis celui avec le plus de cours
      paths.sort((a, b) => {
        if (a.userId === null && b.userId !== null) return -1
        if (a.userId !== null && b.userId === null) return 1
        return b.courses.length - a.courses.length
      })

      const master = paths[0]
      const slaves = paths.slice(1)

      for (const slave of slaves) {
        this.logger.info(`  Fusion du parcours "${slave.title}" (ID:${slave.id}, ${slave.courses.length} cours) -> Master (ID:${master.id}, ${master.courses.length} cours)`)

        // S'assurer que le Master récupère les cours que le Slave possède et qu'il n'a pas encore
        for (const slaveCourse of slave.courses) {
          const exists = master.courses.find(c => c.id === slaveCourse.id)
          if (!exists) {
            const lastOrder = master.courses.length > 0 ? Math.max(...master.courses.map(c => c.$extras.pivot_order || 0)) : 0
            await master.related('courses').attach({ [slaveCourse.id]: { order: lastOrder + 1 } })
          }
        }

        // Si le slave appartient à un utilisateur et le master est admin, on pourrait vouloir 
        // recréer un lien pour cet utilisateur, mais ici on simplifie en supprimant le doublon
        await slave.delete()
      }
    }
  }

  private async finalCleanup() {
    this.logger.info('3. Nettoyage final des éléments orphelins...')

    // Supprimer parcours sans cours
    const emptyPaths = await LearningPath.query().preload('courses')
    for (const p of emptyPaths) {
      if (p.courses.length === 0) await p.delete()
    }

    // Supprimer partages sans parcours
    const shares = await SharedLearningPath.query().preload('learningPath')
    for (const s of shares) {
      if (!s.learningPath) await s.delete()
    }
  }

  private async safelyUpdateRelation(table: string, where: any, update: any) {
    try {
      const existing = await db.from(table).where({ ...where, ...update }).first()
      if (!existing) {
        await db.from(table).where(where).update(update)
      } else {
        await db.from(table).where(where).delete()
      }
    } catch (e) {
      this.logger.error(`Erreur sur table ${table}: ${e.message}`)
    }
  }
}
