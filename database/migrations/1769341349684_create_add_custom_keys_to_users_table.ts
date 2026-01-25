import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('custom_gemini_key').nullable()
      table.text('custom_openrouter_key').nullable()
      table.boolean('use_custom_keys').defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('custom_gemini_key')
      table.dropColumn('custom_openrouter_key')
      table.dropColumn('use_custom_keys')
    })
  }
}