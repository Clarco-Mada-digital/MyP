import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import StudyGroupMember from '#models/study_group_member'

export default class StudyGroup extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare description: string | null

  @column()
  declare creatorId: number

  @column()
  declare inviteCode: string

  @column()
  declare isPrivate: boolean

  @column()
  declare maxMembers: number

  @column()
  declare category: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => User, { foreignKey: 'creatorId' })
  declare creator: BelongsTo<typeof User>

  @hasMany(() => StudyGroupMember, { foreignKey: 'studyGroupId' })
  declare members: HasMany<typeof StudyGroupMember>

  // Methods
  static generateInviteCode(): string {
    return Math.random().toString(36).substring(2, 10).toUpperCase()
  }

  async getMemberCount(): Promise<number> {
    return await StudyGroupMember.query().where('studyGroupId', this.id).count('* as total').then((r: any) => r[0].$extras.total)
  }

  async isMember(userId: number): Promise<boolean> {
    const member = await StudyGroupMember.query().where('studyGroupId', this.id).where('userId', userId).first()
    return !!member
  }

  async addMember(userId: number, role: 'admin' | 'moderator' | 'member' = 'member'): Promise<StudyGroupMember> {
    return await StudyGroupMember.create({
      studyGroupId: this.id,
      userId,
      role
    })
  }
}
