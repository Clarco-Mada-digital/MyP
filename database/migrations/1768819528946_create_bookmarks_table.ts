import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'bookmarks'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().references('users.id').onDelete('CASCADE')
      table.integer('course_id').unsigned().references('courses.id').onDelete('CASCADE')
      table.timestamp('created_at')
      table.timestamp('updated_at')

      // Prevent duplicate bookmarks
      table.unique(['user_id', 'course_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
