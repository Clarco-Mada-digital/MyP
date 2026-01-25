import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeSave, column, hasMany } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import Course from '#models/course'
import CourseProgress from '#models/course_progress'
import Bookmark from '#models/bookmark'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class User extends compose(BaseModel, AuthFinder) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare fullName: string

  @column({ serializeAs: 'email' })
  declare email: string

  @column({ serializeAs: null })
  declare password: string

  @column()
  declare aiProvider: string

  @column()
  declare aiModel: string

  @column()
  declare customGeminiKey: string | null

  @column()
  declare customOpenrouterKey: string | null

  @column()
  declare useCustomKeys: boolean

  @column()
  declare isAdmin: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => Course)
  declare courses: HasMany<typeof Course>

  @hasMany(() => CourseProgress)
  declare progress: HasMany<typeof CourseProgress>

  @hasMany(() => Bookmark)
  declare bookmarks: HasMany<typeof Bookmark>

  @beforeSave()
  static async hashPassword(user: any) {
    if (user.$dirty.password && !user.password.startsWith('$scrypt$')) {
      const { default: hash } = await import('@adonisjs/core/services/hash')
      user.password = await hash.make(user.password)
    }
  }
}