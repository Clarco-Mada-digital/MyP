import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class GuestAccess extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare ipAddress: string

  @column()
  declare guestId: string | null

  @column()
  declare country: string | null

  @column()
  declare countryCode: string | null

  @column()
  declare city: string | null

  @column()
  declare userAgent: string | null

  @column()
  declare courseId: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}