import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'learning_paths'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('title').notNullable()
      table.string('slug').notNullable().unique()
      table.text('description').nullable()
      table.string('icon').defaultTo('🎯')
      table.string('difficulty').defaultTo('Débutant') // Débutant, Intermédiaire, Avancé
      table.string('color').defaultTo('#8b5cf6')
      table.integer('estimated_hours').nullable()
      table.boolean('is_sequential').defaultTo(false) // Si true, les cours doivent être faits dans l'ordre
      table.boolean('is_published').defaultTo(true)

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}