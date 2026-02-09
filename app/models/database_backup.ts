import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export default class DatabaseBackup extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare filename: string

  @column()
  declare filepath: string

  @column()
  declare type: 'manual' | 'automatic'

  @column()
  declare status: 'pending' | 'completed' | 'failed'

  @column()
  declare size: number | null

  @column()
  declare tables: string | null

  @column()
  declare errorMessage: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
