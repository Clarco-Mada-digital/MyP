import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Mentorship from '#models/mentorship'

export default class MentorshipSession extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare mentorshipId: number

  @column()
  declare title: string

  @column()
  declare description: string | null

  @column.dateTime()
  declare scheduledAt: DateTime

  @column()
  declare durationMinutes: number

  @column()
  declare status: 'scheduled' | 'completed' | 'cancelled'

  @column()
  declare notes: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => Mentorship, { foreignKey: 'mentorshipId' })
  declare mentorship: BelongsTo<typeof Mentorship>

  // Methods
  complete(): void {
    this.status = 'completed'
  }

  cancel(): void {
    this.status = 'cancelled'
  }

  isScheduled(): boolean {
    return this.status === 'scheduled'
  }

  isCompleted(): boolean {
    return this.status === 'completed'
  }

  isPastDue(): boolean {
    return this.scheduledAt < DateTime.now() && this.status === 'scheduled'
  }

  getFormattedDuration(): string {
    const hours = Math.floor(this.durationMinutes / 60)
    const minutes = this.durationMinutes % 60
    
    if (hours > 0) {
      return minutes > 0 ? `${hours}h${minutes}min` : `${hours}h`
    }
    return `${minutes}min`
  }

  getFormattedDate(): string {
    return this.scheduledAt.toFormat('dd MMM yyyy à HH:mm')
  }
}
