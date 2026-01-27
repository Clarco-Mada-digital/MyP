import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import StudyGroup from '#models/study_group'

export default class StudyGroupMember extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare studyGroupId: number

  @column()
  declare userId: number

  @column()
  declare role: 'admin' | 'moderator' | 'member'

  @column.dateTime()
  declare joinedAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => StudyGroup, { foreignKey: 'studyGroupId' })
  declare studyGroup: BelongsTo<typeof StudyGroup>

  @belongsTo(() => User, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof User>

  // Methods
  isAdmin(): boolean {
    return this.role === 'admin'
  }

  isModerator(): boolean {
    return this.role === 'moderator' || this.role === 'admin'
  }

  canManageGroup(): boolean {
    return this.role === 'admin' || this.role === 'moderator'
  }
}
