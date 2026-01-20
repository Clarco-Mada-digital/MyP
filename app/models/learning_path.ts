import { DateTime } from 'luxon'
import { BaseModel, column, manyToMany } from '@adonisjs/lucid/orm'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'
import Course from '#models/course'

export default class LearningPath extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string

  @column()
  declare slug: string

  @column()
  declare description: string | null

  @column()
  declare icon: string

  @column()
  declare difficulty: string

  @column()
  declare color: string

  @column()
  declare estimatedHours: number | null

  @column()
  declare isSequential: boolean

  @column()
  declare isPublished: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @manyToMany(() => Course, {
    pivotTable: 'learning_path_courses',
    pivotColumns: ['order', 'is_required'],
    pivotTimestamps: true
  })
  declare courses: ManyToMany<typeof Course>

  // Transient properties for progression tracking
  public completedCount?: number
  public totalCount?: number
  public progressPercent?: number
}