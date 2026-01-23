import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'course_progresses'

  async up() {
    if (!(await this.schema.hasTable(this.tableName))) {
      this.schema.createTable(this.tableName, (table) => {
        table.increments('id')
        table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
        table.integer('course_id').unsigned().references('id').inTable('courses').onDelete('CASCADE')
        table.string('module_title').notNullable()
        table.string('lesson_title').notNullable()

        table.unique(['user_id', 'course_id', 'module_title', 'lesson_title'])

        table.timestamp('created_at')
        table.timestamp('updated_at')
      })
    }
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}