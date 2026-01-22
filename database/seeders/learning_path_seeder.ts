import { BaseSeeder } from '@adonisjs/lucid/seeders'
import LearningPath from '#models/learning_path'
import Course from '#models/course'

export default class extends BaseSeeder {
  async run() {
    // Créer des parcours d'exemple
    const paths = [
      {
        title: 'Développement et programation',
        slug: 'developpeur-web-full-stack',
        description: 'Maîtrisez le développement web de A à Z : du HTML/CSS jusqu\'aux frameworks modernes et bases de données.',
        icon: '💻',
        difficulty: 'Intermédiaire',
        color: '#3b82f6',
        estimatedHours: 120,
        isSequential: true,
        isPublished: true,
        courseTopics: ['HTML', 'CSS', 'JavaScript', 'React', 'Node.js', 'Base de données']
      },
      {
        title: 'Data Science & IA',
        slug: 'data-science-ia',
        description: 'Devenez expert en science des données et intelligence artificielle avec Python, Machine Learning et Deep Learning.',
        icon: '🤖',
        difficulty: 'Avancé',
        color: '#8b5cf6',
        estimatedHours: 150,
        isSequential: true,
        isPublished: true,
        courseTopics: ['Python', 'Statistiques', 'Machine Learning', 'Deep Learning', 'TensorFlow']
      },
      {
        title: 'Marketing Digital',
        slug: 'marketing-digital',
        description: 'Apprenez les stratégies modernes de marketing digital : SEO, réseaux sociaux, publicité en ligne et analytics.',
        icon: '📈',
        difficulty: 'Débutant',
        color: '#10b981',
        estimatedHours: 60,
        isSequential: false,
        isPublished: true,
        courseTopics: ['SEO', 'Réseaux sociaux', 'Google Ads', 'Analytics', 'Content Marketing']
      },
      {
        title: 'Design UI/UX',
        slug: 'design-ui-ux',
        description: 'Créez des interfaces utilisateur exceptionnelles et des expériences mémorables avec Figma et les principes du design.',
        icon: '🎨',
        difficulty: 'Intermédiaire',
        color: '#ec4899',
        estimatedHours: 80,
        isSequential: false,
        isPublished: true,
        courseTopics: ['Figma', 'Design Thinking', 'Prototypage', 'User Research', 'Design Systems']
      }
    ]

    for (const pathData of paths) {
      // Créer le parcours
      const path = await LearningPath.create({
        title: pathData.title,
        slug: pathData.slug,
        description: pathData.description,
        icon: pathData.icon,
        difficulty: pathData.difficulty,
        color: pathData.color,
        estimatedHours: pathData.estimatedHours,
        isSequential: pathData.isSequential,
        isPublished: pathData.isPublished
      })

      // Chercher des cours existants qui correspondent aux topics
      // (Si aucun cours n'existe, le parcours sera vide pour l'instant)
      for (let i = 0; i < pathData.courseTopics.length; i++) {
        const topic = pathData.courseTopics[i]
        const course = await Course.query()
          .where('status', 'ready')
          .andWhere((query) => {
            query.where('title', 'like', `%${topic}%`)
              .orWhere('topicTag', 'like', `%${topic}%`)
          })
          .first()

        if (course) {
          // Attacher le cours au parcours avec l'ordre
          await path.related('courses').attach({
            [course.id]: {
              order: i + 1,
              is_required: true
            }
          })
        }
      }

      console.log(`✅ Parcours créé : ${path.title}`)
    }
  }
}