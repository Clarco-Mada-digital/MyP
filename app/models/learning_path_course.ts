import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import LearningPath from '#models/learning_path'
import Course from '#models/course'

export default class LearningPathCourse extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare learningPathId: number

  @column()
  declare courseId: number

  @column()
  declare order: number

  @column()
  declare isRequired: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => LearningPath)
  declare learningPath: BelongsTo<typeof LearningPath>

  @belongsTo(() => Course)
  declare course: BelongsTo<typeof Course>
}