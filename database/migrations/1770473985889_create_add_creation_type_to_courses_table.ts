import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'courses'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('creation_type').defaultTo('ai').comment('ai, manual, or user_edited')
      table.timestamp('last_edited_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('creation_type')
      table.dropColumn('last_edited_at')
    })
  }
}