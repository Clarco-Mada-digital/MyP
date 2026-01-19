import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'guest_accesses'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('ip_address').notNullable()
      table.integer('course_id').unsigned().references('courses.id').onDelete('CASCADE')
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}