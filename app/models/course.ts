import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

export default class Course extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number | null

  @column()
  declare title: string

  @column()
  declare slug: string

  @column()
  declare description: string | null

  @column({
    consume: (value) => (value && typeof value === 'string' ? JSON.parse(value) : value),
    prepare: (value) => (value ? JSON.stringify(value) : value),
  })
  declare content: any

  @column()
  declare status: string

  @column.dateTime()
  declare lastReviewedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare owner: BelongsTo<typeof User>
}