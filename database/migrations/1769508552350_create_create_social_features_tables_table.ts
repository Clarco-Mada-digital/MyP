import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // Table pour le partage de parcours
    this.schema.createTable('shared_learning_paths', (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
      table.integer('learning_path_id').unsigned().references('id').inTable('learning_paths').onDelete('CASCADE')
      table.string('share_token').unique()
      table.string('title').notNullable()
      table.text('description')
      table.boolean('is_public').defaultTo(false)
      table.integer('views_count').defaultTo(0)
      table.integer('shares_count').defaultTo(0)
      table.timestamp('expires_at').nullable()
      table.timestamps()
    })

    // Table pour les groupes d'étude
    this.schema.createTable('study_groups', (table) => {
      table.increments('id')
      table.string('name').notNullable()
      table.text('description')
      table.integer('creator_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
      table.string('invite_code').unique()
      table.boolean('is_private').defaultTo(false)
      table.integer('max_members').defaultTo(50)
      table.string('category').nullable()
      table.timestamps()
    })

    // Table pour les membres des groupes d'étude
    this.schema.createTable('study_group_members', (table) => {
      table.increments('id')
      table.integer('study_group_id').unsigned().references('id').inTable('study_groups').onDelete('CASCADE')
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
      table.enum('role', ['admin', 'moderator', 'member']).defaultTo('member')
      table.timestamp('joined_at').defaultTo(this.now())
      table.timestamps()
    })

    // Table pour le forum
    this.schema.createTable('forum_categories', (table) => {
      table.increments('id')
      table.string('name').notNullable()
      table.text('description')
      table.string('slug').unique()
      table.string('color').defaultTo('#6366f1')
      table.integer('order_index').defaultTo(0)
      table.boolean('is_active').defaultTo(true)
      table.timestamps()
    })

    // Table pour les sujets du forum
    this.schema.createTable('forum_topics', (table) => {
      table.increments('id')
      table.string('title').notNullable()
      table.text('content').notNullable()
      table.integer('category_id').unsigned().references('id').inTable('forum_categories').onDelete('CASCADE')
      table.integer('author_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
      table.boolean('is_pinned').defaultTo(false)
      table.boolean('is_locked').defaultTo(false)
      table.integer('views_count').defaultTo(0)
      table.integer('reply_count').defaultTo(0)
      table.timestamp('last_reply_at').nullable()
      table.timestamps()
    })

    // Table pour les réponses du forum
    this.schema.createTable('forum_replies', (table) => {
      table.increments('id')
      table.text('content').notNullable()
      table.integer('topic_id').unsigned().references('id').inTable('forum_topics').onDelete('CASCADE')
      table.integer('author_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
      table.integer('parent_id').unsigned().references('id').inTable('forum_replies').onDelete('CASCADE').nullable()
      table.boolean('is_solution').defaultTo(false)
      table.integer('likes_count').defaultTo(0)
      table.timestamps()
    })

    // Table pour les avis sur les cours
    this.schema.createTable('course_reviews', (table) => {
      table.increments('id')
      table.integer('course_id').unsigned().references('id').inTable('courses').onDelete('CASCADE')
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
      table.integer('rating').notNullable() // 1-5 étoiles
      table.text('comment')
      table.boolean('is_recommended').defaultTo(false)
      table.integer('helpful_count').defaultTo(0)
      table.timestamps()
    })

    // Table pour le mentorat
    this.schema.createTable('mentorships', (table) => {
      table.increments('id')
      table.integer('mentor_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
      table.integer('mentee_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
      table.enum('status', ['pending', 'active', 'completed', 'cancelled']).defaultTo('pending')
      table.text('goals').nullable()
      table.text('notes').nullable()
      table.timestamp('started_at').nullable()
      table.timestamp('ended_at').nullable()
      table.timestamps()
    })

    // Table pour les sessions de mentorat
    this.schema.createTable('mentorship_sessions', (table) => {
      table.increments('id')
      table.integer('mentorship_id').unsigned().references('id').inTable('mentorships').onDelete('CASCADE')
      table.string('title').notNullable()
      table.text('description')
      table.timestamp('scheduled_at')
      table.integer('duration_minutes').defaultTo(60)
      table.enum('status', ['scheduled', 'completed', 'cancelled']).defaultTo('scheduled')
      table.text('notes').nullable()
      table.timestamps()
    })

    // Index pour optimiser les performances
    this.schema.alterTable('shared_learning_paths', (table) => {
      table.index(['user_id', 'is_public'])
      table.index('share_token')
    })

    this.schema.alterTable('study_group_members', (table) => {
      table.index(['study_group_id', 'user_id'])
      table.index('role')
    })

    this.schema.alterTable('forum_topics', (table) => {
      table.index(['category_id', 'is_pinned'])
      table.index('author_id')
    })

    this.schema.alterTable('course_reviews', (table) => {
      table.index(['course_id', 'rating'])
      table.unique(['course_id', 'user_id'])
    })
  }

  async down() {
    this.schema.dropTableIfExists('mentorship_sessions')
    this.schema.dropTableIfExists('mentorships')
    this.schema.dropTableIfExists('course_reviews')
    this.schema.dropTableIfExists('forum_replies')
    this.schema.dropTableIfExists('forum_topics')
    this.schema.dropTableIfExists('forum_categories')
    this.schema.dropTableIfExists('study_group_members')
    this.schema.dropTableIfExists('study_groups')
    this.schema.dropTableIfExists('shared_learning_paths')
  }
}