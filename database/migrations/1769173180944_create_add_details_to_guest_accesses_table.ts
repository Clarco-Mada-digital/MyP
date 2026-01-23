import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'guest_accesses'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('guest_id').nullable().index()
      table.string('country').nullable()
      table.string('country_code').nullable()
      table.string('city').nullable()
      table.text('user_agent').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('guest_id')
      table.dropColumn('country')
      table.dropColumn('country_code')
      table.dropColumn('city')
      table.dropColumn('user_agent')
    })
  }
}