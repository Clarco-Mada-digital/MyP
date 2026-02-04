import db from '@adonisjs/lucid/services/db'
import { BaseCommand } from '@adonisjs/core/ace'

export default class DumpData extends BaseCommand {
  static commandName = 'dump:paths'
  static options = { startApp: true }

  async run() {
    const paths = await db.from('learning_paths').select('*')
    const shares = await db.from('shared_learning_paths').select('*')
    const pivots = await db.from('learning_path_courses').select('*')

    this.logger.info('--- LEARNING PATHS ---')
    console.table(paths.map(p => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      user: p.user_id,
      origin: p.origin_shared_path_id,
      pub: p.is_published
    })))

    this.logger.info('--- SHARED LEARNING PATHS ---')
    console.table(shares.map(s => ({ id: s.id, lp_id: s.learning_path_id, title: s.title, user: s.user_id })))

    this.logger.info('--- PIVOT TABLE ---')
    console.log('Count:', pivots.length)
  }
}
