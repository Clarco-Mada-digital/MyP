import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'courses'

  async up() {
    if (!(await this.schema.hasTable(this.tableName))) {
      this.schema.createTable(this.tableName, (table) => {
        table.increments('id')
        table.string('title').notNullable()
        table.string('slug').notNullable().unique()
        table.text('description').nullable()
        table.jsonb('content').nullable()
        table.string('status').defaultTo('generating')
        table.timestamp('last_reviewed_at').nullable()
        table.timestamp('created_at')
        table.timestamp('updated_at')
      })
    }
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}