import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'database_backups'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('filename').notNullable()
      table.string('filepath').notNullable()
      table.enum('type', ['manual', 'automatic']).notNullable()
      table.enum('status', ['pending', 'completed', 'failed']).notNullable()
      table.integer('size').nullable()
      table.text('tables').nullable()
      table.text('error_message').nullable()
      
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
