import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Course from './course.js'
import User from './user.js'
import { DateTime } from 'luxon'

export default class CourseDeletionRequest extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare courseId: number

  @column()
  declare userId: number

  @column()
  declare reason: string | null

  @column()
  declare status: 'pending' | 'approved' | 'rejected'

  @column()
  declare adminNote: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Course)
  declare course: BelongsTo<typeof Course>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
