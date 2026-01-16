import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('ai_model').defaultTo('gemini-2.0-flash-lite').alter()
    })

    // Mettre à jour les utilisateurs existants qui ont le vieux modèle par défaut
    this.defer(async (db) => {
      await db.from(this.tableName)
        .where('ai_model', 'gemini-1.5-flash')
        .update({ ai_model: 'gemini-2.0-flash-lite' })
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('ai_model').defaultTo('gemini-1.5-flash').alter()
    })
  }
}