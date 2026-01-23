import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class ApplicationSetting extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare key: string

  @column()
  declare value: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  static async getValue(key: string, defaultValue: string = ''): Promise<string> {
    const setting = await this.findBy('key', key)
    return setting ? setting.value : defaultValue
  }

  static async setValue(key: string, value: string): Promise<void> {
    const setting = await this.updateOrCreate({ key }, { value })
    await setting.save()
  }
}