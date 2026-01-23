import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    if (!(await this.schema.hasColumn(this.tableName, 'ai_provider'))) {
      this.schema.alterTable(this.tableName, (table) => {
        table.string('ai_provider').defaultTo('gemini')
      })
    }
    if (!(await this.schema.hasColumn(this.tableName, 'ai_model'))) {
      this.schema.alterTable(this.tableName, (table) => {
        table.string('ai_model').defaultTo('gemini-1.5-flash')
      })
    }
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('ai_provider')
      table.dropColumn('ai_model')
    })
  }
}