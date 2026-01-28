import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'learning_paths'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('origin_shared_path_id').unsigned().references('id').inTable('shared_learning_paths').onDelete('SET NULL').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('origin_shared_path_id')
    })
  }
}