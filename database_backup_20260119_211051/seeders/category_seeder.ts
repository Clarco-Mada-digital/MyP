import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Category from '#models/category'

export default class extends BaseSeeder {
  async run() {
    await Category.updateOrCreateMany('slug', [
      {
        name: 'Programmation & Développement Web',
        slug: 'web-development',
        icon: '💻',
        color: '#3b82f6'
      },
      {
        name: 'Intelligence Artificielle',
        slug: 'artificial-intelligence',
        icon: '🤖',
        color: '#8b5cf6'
      },
      {
        name: 'Data Science',
        slug: 'data-science',
        icon: '📊',
        color: '#10b981'
      },
      {
        name: 'Design',
        slug: 'design',
        icon: '🎨',
        color: '#f59e0b'
      },
      {
        name: 'Marketing',
        slug: 'marketing',
        icon: '📢',
        color: '#ef4444'
      },
      {
        name: 'Business',
        slug: 'business',
        icon: '💼',
        color: '#6366f1'
      }
    ])
  }
}
