import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

import Course from '#models/course'
import { DateTime } from 'luxon'

export default class CheckCourseUpdates extends BaseCommand {
  static commandName = 'check:course-updates'
  static description = 'Check courses older than 3 months and trigger AI review'

  static options: CommandOptions = {}

  async run() {
    const threeMonthsAgo = DateTime.now().minus({ months: 3 })

    const coursesToReview = await Course.query()
      .where('status', 'ready')
      .where((query) => {
        query.where('lastReviewedAt', '<', threeMonthsAgo.toSQL())
          .orWhereNull('lastReviewedAt')
          .andWhere('createdAt', '<', threeMonthsAgo.toSQL())
      })

    this.logger.info(`Found ${coursesToReview.length} courses to review.`)

    for (const course of coursesToReview) {
      this.logger.info(`Reviewing course: ${course.title}`)

      // In a real implementation, we would call the AI to see if updates are needed
      // course.status = 'updating'
      // ...

      course.lastReviewedAt = DateTime.now()
      await course.save()
    }

    this.logger.success('Maintenance check completed.')
  }
}