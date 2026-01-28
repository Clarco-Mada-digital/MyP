import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import ForumTopic from '#models/forum_topic'

export default class ForumReply extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare content: string

  @column()
  declare topicId: number

  @column()
  declare authorId: number

  @column()
  declare parentId: number | null

  @column()
  declare isSolution: boolean

  @column()
  declare likesCount: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => ForumTopic, { foreignKey: 'topicId' })
  declare topic: BelongsTo<typeof ForumTopic>

  @belongsTo(() => User, { foreignKey: 'authorId' })
  declare author: BelongsTo<typeof User>

  @belongsTo(() => ForumReply, { foreignKey: 'parentId' })
  declare parent: BelongsTo<typeof ForumReply>

  @hasMany(() => ForumReply, { foreignKey: 'parentId' })
  declare replies: HasMany<typeof ForumReply>

  // Methods
  incrementLikes(): void {
    this.likesCount++
  }

  markAsSolution(): void {
    this.isSolution = true
  }

  isReply(): boolean {
    return !!this.parentId
  }

  async getDepth(): Promise<number> {
    if (!this.parentId) return 0

    let depth = 1
    let current: ForumReply = this

    while (current.parentId) {
      const parent = await ForumReply.find(current.parentId)
      if (!parent || !parent.parentId) break
      depth++
      current = parent
    }

    return depth
  }
}
