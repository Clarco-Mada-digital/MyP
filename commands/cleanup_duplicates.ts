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

    // --- 1. NETTOYAGE DES PARCOURS EN DOUBLON POUR UN MÊME UTILISATEUR ---
    this.logger.info('Vérification des parcours importés plusieurs fois par le même utilisateur...')
    const multipleImports = await db.rawQuery(`
      select user_id, origin_shared_path_id, count(*) as count 
      from learning_paths 
      where origin_shared_path_id is not null 
      group by user_id, origin_shared_path_id 
      having count > 1
    `)

    for (const row of multipleImports) {
      const paths = await LearningPath.query()
        .where('userId', row.user_id)
        .where('originSharedPathId', row.origin_shared_path_id)
        .orderBy('createdAt', 'desc')

      // On garde le premier (le plus récent), on supprime les autres
      const toDelete = paths.slice(1)

      for (const p of toDelete) {
        this.logger.info(`  Suppression du parcours en triple: ${p.title} (ID: ${p.id}) pour l'utilisateur ${p.userId}`)
        await p.delete()
      }
    }

    // --- 2. RÉ-ASSOCIATION DES COURS ET FUSION DES PROGRESSIONS ---
    const importedPaths = await LearningPath.query()
      .whereNotNull('originSharedPathId')
      .preload('courses')

    for (const path of importedPaths) {
      const originSharedPathId = path.originSharedPathId
      if (!originSharedPathId) continue

      this.logger.info(`Traitement du parcours: ${path.title} (ID: ${path.id})`)

      const sharedPath = await SharedLearningPath.query()
        .where('id', originSharedPathId)
        .preload('learningPath', (q) => q.preload('courses'))
        .first()

      if (!sharedPath || !sharedPath.learningPath) {
        this.logger.warning(`  Impossible de trouver la source originale pour le parcours ${path.id}`)
        continue
      }

      const originalCourses = sharedPath.learningPath.courses
      const importedCourses = path.courses
      const ownerId = path.userId
      if (!ownerId) {
        this.logger.warning(`  Skipping path ${path.id} - no owner ID`)
        continue
      }

      for (const importedCourse of importedCourses) {
        const original = originalCourses.find(oc =>
          importedCourse.title === oc.title ||
          importedCourse.slug === oc.slug ||
          importedCourse.slug.startsWith(oc.slug)
        )

        if (original && original.id !== importedCourse.id) {
          this.logger.info(`  Fusion du cours "${importedCourse.title}": ${importedCourse.id} -> ${original.id}`)

          try {
            const existingProgress = await db.from('course_progresses')
              .where('user_id', ownerId!)
              .where('course_id', original.id)
              .select('id')

            if (existingProgress.length === 0) {
              await db.from('course_progresses')
                .where('user_id', ownerId!)
                .where('course_id', importedCourse.id)
                .update({ course_id: original.id })
            } else {
              await db.from('course_progresses')
                .where('user_id', ownerId!)
                .where('course_id', importedCourse.id)
                .delete()
            }
          } catch (e) {
            this.logger.error(`    Erreur transfert progression: ${e.message}`)
          }

          await db.from('bookmarks')
            .where('user_id', ownerId!)
            .where('course_id', importedCourse.id)
            .update({ course_id: original.id }).catch(() => { })

          await db.from('learning_path_courses')
            .where('learning_path_id', path.id)
            .where('course_id', importedCourse.id)
            .update({ course_id: original.id })

          const usage = await db.from('learning_path_courses')
            .where('course_id', importedCourse.id)
            .count('* as total')

          if (Number((usage[0] as any).total) === 0) {
            await importedCourse.delete()
            this.logger.success(`    Duplicata supprimé: ${importedCourse.id}`)
          }
        }
      }
    }

    this.logger.success('✨ Nettoyage terminé avec succès !')
  }
}
