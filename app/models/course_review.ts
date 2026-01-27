import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Course from '#models/course'

export default class CourseReview extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare courseId: number

  @column()
  declare userId: number

  @column()
  declare rating: number // 1-5

  @column()
  declare comment: string | null

  @column()
  declare isRecommended: boolean

  @column()
  declare helpfulCount: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => Course, { foreignKey: 'courseId' })
  declare course: BelongsTo<typeof Course>

  @belongsTo(() => User, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof User>

  // Methods
  incrementHelpful(): void {
    this.helpfulCount++
  }

  getStars(): string {
    return '⭐'.repeat(this.rating) + '☆'.repeat(5 - this.rating)
  }

  isPositive(): boolean {
    return this.rating >= 4
  }

  isNegative(): boolean {
    return this.rating <= 2
  }

  static async getAverageRating(courseId: number): Promise<number> {
    const result = await this.query()
      .where('courseId', courseId)
      .avg('rating as average')
      .first()
    
    return Math.round((result?.$extras.average || 0) * 10) / 10
  }

  static async getRatingDistribution(courseId: number): Promise<{[key: number]: number}> {
    const results = await this.query()
      .where('courseId', courseId)
      .select('rating')
      .count('* as count')
      .groupBy('rating')
    
    const distribution: {[key: number]: number} = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    
    results.forEach((result: any) => {
      distribution[result.rating] = parseInt(result.$extras.count)
    })
    
    return distribution
  }
}
