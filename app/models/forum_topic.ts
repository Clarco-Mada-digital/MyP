import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import ForumCategory from '#models/forum_category'
import ForumReply from '#models/forum_reply'

export default class ForumTopic extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string

  @column()
  declare content: string

  @column()
  declare categoryId: number

  @column()
  declare authorId: number

  @column()
  declare isPinned: boolean

  @column()
  declare isLocked: boolean

  @column()
  declare viewsCount: number

  @column()
  declare replyCount: number

  @column.dateTime()
  declare lastReplyAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => ForumCategory, { foreignKey: 'categoryId' })
  declare category: BelongsTo<typeof ForumCategory>

  @belongsTo(() => User, { foreignKey: 'authorId' })
  declare author: BelongsTo<typeof User>

  @hasMany(() => ForumReply, { foreignKey: 'topicId' })
  declare replies: HasMany<typeof ForumReply>

  // Methods
  incrementViews(): void {
    this.viewsCount++
  }

  incrementReplyCount(): void {
    this.replyCount++
  }

  updateLastReply(): void {
    this.lastReplyAt = DateTime.now()
  }

  hasRecentActivity(): boolean {
    if (!this.lastReplyAt) return false
    return this.lastReplyAt > DateTime.now().minus({ days: 7 })
  }
}
