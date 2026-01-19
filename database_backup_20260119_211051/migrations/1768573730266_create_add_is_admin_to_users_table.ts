import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    if (!await this.schema.hasColumn(this.tableName, 'is_admin')) {
      this.schema.alterTable(this.tableName, (table) => {
        table.boolean('is_admin').defaultTo(false)
      })
    }
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('is_admin')
    })
  }
}