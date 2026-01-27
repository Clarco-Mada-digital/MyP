import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import MentorshipSession from '#models/mentorship_session'

export default class Mentorship extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare mentorId: number

  @column()
  declare menteeId: number

  @column()
  declare status: 'pending' | 'active' | 'completed' | 'cancelled'

  @column()
  declare goals: string | null

  @column()
  declare notes: string | null

  @column.dateTime()
  declare startedAt: DateTime | null

  @column.dateTime()
  declare endedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => User, { foreignKey: 'mentorId' })
  declare mentor: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'menteeId' })
  declare mentee: BelongsTo<typeof User>

  @hasMany(() => MentorshipSession, { foreignKey: 'mentorshipId' })
  declare sessions: HasMany<typeof MentorshipSession>

  // Methods
  activate(): void {
    this.status = 'active'
    this.startedAt = DateTime.now()
  }

  complete(): void {
    this.status = 'completed'
    this.endedAt = DateTime.now()
  }

  cancel(): void {
    this.status = 'cancelled'
    this.endedAt = DateTime.now()
  }

  isActive(): boolean {
    return this.status === 'active'
  }

  isPending(): boolean {
    return this.status === 'pending'
  }

  isCompleted(): boolean {
    return this.status === 'completed'
  }

  async getSessionCount(): Promise<number> {
    return await MentorshipSession.query()
      .where('mentorshipId', this.id)
      .where('status', 'completed')
      .count('* as total')
      .then((r: any) => r[0].$extras.total)
  }

  async getTotalHours(): Promise<number> {
    const result = await MentorshipSession.query()
      .where('mentorshipId', this.id)
      .where('status', 'completed')
      .sum('durationMinutes as total')
      .first()
    
    return Math.round((result?.$extras.total || 0) / 60 * 10) / 10
  }
}
