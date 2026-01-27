import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import ForumTopic from '#models/forum_topic'

export default class ForumCategory extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare description: string | null

  @column()
  declare slug: string

  @column()
  declare color: string

  @column()
  declare orderIndex: number

  @column()
  declare isActive: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @hasMany(() => ForumTopic, { foreignKey: 'categoryId' })
  declare topics: HasMany<typeof ForumTopic>

  // Methods
  async getTopicCount(): Promise<number> {
    return await ForumTopic.query().where('categoryId', this.id).count('* as total').then((r: any) => r[0].$extras.total)
  }

  async getReplyCount(): Promise<number> {
    return await ForumTopic.query()
      .where('categoryId', this.id)
      .sum('replyCount as total')
      .then((r: any) => r[0].$extras.total || 0)
  }
}
