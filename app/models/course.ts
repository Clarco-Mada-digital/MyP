import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, ManyToMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Category from '#models/category'
import LearningPath from '#models/learning_path'

export default class Course extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number | null

  @column()
  declare categoryId: number | null

  @column()
  declare title: string

  @column()
  declare slug: string

  @column()
  declare topicTag: string | null

  @column()
  declare description: string | null

  @column({
    consume: (value) => (value && typeof value === 'string' ? JSON.parse(value) : value),
    prepare: (value) => (value ? JSON.stringify(value) : value),
  })
  declare content: any

  @column()
  declare status: string

  @column()
  declare podcastUrl: string | null

  @column()
  declare errorMessage: string | null

  @column.dateTime()
  declare lastReviewedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare owner: BelongsTo<typeof User>

  @belongsTo(() => Category)
  declare category: BelongsTo<typeof Category>

  @manyToMany(() => LearningPath, {
    pivotTable: 'learning_path_courses',
    pivotColumns: ['order', 'is_required'],
    pivotTimestamps: true
  })
  declare learningPaths: ManyToMany<typeof LearningPath>

  // Transient properties for progression tracking
  public lessonsCompleted?: number
  public isCompleted?: boolean
}