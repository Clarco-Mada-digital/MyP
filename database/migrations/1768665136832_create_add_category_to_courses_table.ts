import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'courses'

  async up() {
    if (!(await this.schema.hasColumn(this.tableName, 'category_id'))) {
      this.schema.alterTable(this.tableName, (table) => {
        table.integer('category_id').unsigned().nullable().references('id').inTable('categories').onDelete('SET NULL')
      })
    }
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('category_id')
    })
  }
}