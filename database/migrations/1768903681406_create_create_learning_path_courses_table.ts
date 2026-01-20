import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'learning_path_courses'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('learning_path_id').unsigned().references('id').inTable('learning_paths').onDelete('CASCADE')
      table.integer('course_id').unsigned().references('id').inTable('courses').onDelete('CASCADE')
      table.integer('order').notNullable().defaultTo(0) // Ordre du cours dans le parcours
      table.boolean('is_required').defaultTo(true) // Si false, le cours est optionnel

      table.timestamp('created_at')
      table.timestamp('updated_at')

      // Un cours ne peut être qu'une seule fois dans un parcours
      table.unique(['learning_path_id', 'course_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}