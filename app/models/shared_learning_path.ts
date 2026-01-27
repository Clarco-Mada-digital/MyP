import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import LearningPath from '#models/learning_path'

export default class SharedLearningPath extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare learningPathId: number

  @column()
  declare shareToken: string

  @column()
  declare title: string

  @column()
  declare description: string | null

  @column()
  declare isPublic: boolean

  @column()
  declare viewsCount: number

  @column()
  declare sharesCount: number

  @column.dateTime()
  declare expiresAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => User, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof User>

  @belongsTo(() => LearningPath, { foreignKey: 'learningPathId' })
  declare learningPath: BelongsTo<typeof LearningPath>

  // Methods
  static generateShareToken(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  }

  isExpired(): boolean {
    return this.expiresAt ? this.expiresAt < DateTime.now() : false
  }

  incrementViews(): void {
    this.viewsCount++
  }

  incrementShares(): void {
    this.sharesCount++
  }
}
