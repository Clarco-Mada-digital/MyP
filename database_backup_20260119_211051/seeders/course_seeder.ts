import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Course from '#models/course'

export default class extends BaseSeeder {
  async run() {
    await Course.query().delete()

    await Course.create({
      title: 'Maîtrise Totale d\'AdonisJS 6 : De Zéro à l\'Architecture Royale',
      slug: 'maitrise-totale-adonisjs-6-architecture-royale',
      description: 'Le guide ultime pour bâtir des applications web modernes, robustes et hautement scalables. Apprenez l\'injection de dépendances, le typage statique avancé, et les meilleures pratiques de l\'industrie avec le framework Node.js le plus élégant.',
      status: 'ready',
      content: {
        level: 'Expert',
        image: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1200&q=80',
        modules: [
          {
            title: 'Module 1 : Le Cœur de la Machine',
            lessons: [
              {
                title: 'L\'Architecture du Framework',
                content: `AdonisJS se distingue par son architecture inspirée des frameworks d'entreprise comme Laravel ou Spring. Au centre de tout se trouve l'IoC Container (Inversion of Control).\n\nPourquoi c'est important ?\n1. Testabilité : Vous pouvez facilement mocker vos services.\n2. Découplage : Votre logique métier n'est pas liée à une implémentation spécifique.\n3. Injection de dépendances : Plus besoin de gérer les cycles d'imports manuellement.\n\nDans cette version 6, Adonis utilise les ESM (ECMAScript Modules) de manière native, ce qui garantit une performance maximale et une compatibilité avec le futur de Node.js.`,
                audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
              },
              {
                title: 'Le Cycle de Vie d\'une Requête',
                content: `Chaque milliseconde compte. Comprendre le cycle HTTP est crucial pour optimiser votre application.\n\n1. Serveur HTTP : Reçoit la requête brute.\n2. Middlewares Globaux : Vérifient les cookies, le CORS, le CSRF.\n3. Router : Trouve le contrôleur correspondant.\n4. Middlewares de Route : (ex: Authentification).\n5. Contrôleur : Exécute votre logique.\n6. Réponse : Envoyée au client.\n\nVoici un exemple de middleware moderne :\n\nexport default class UserLogger {\n  async handle(ctx, next) {\n    console.log('Utilisateur:', ctx.auth.user.email)\n    await next()\n  }\n}`,
                video_url: 'https://www.w3schools.com/html/mov_bbb.mp4'
              }
            ],
            exercises: [
              'Créez un fournisseur de services (Service Provider) qui enregistre une clé "DateFetcher" dans le container IoC.',
              'Implémentez un middleware qui vérifie si l\'en-tête "X-App-Version" est présent.'
            ]
          },
          {
            title: 'Module 2 : Dompter Lucid ORM',
            lessons: [
              {
                title: 'Schémas et Migrations Avancées',
                content: `Oubliez les erreurs en production. Lucid vous permet de définir vos schémas avec TypeScript pour une auto-complétion totale.\n\nLes migrations ne sont pas juste des fichiers SQL. Elles sont le journal de bord de votre architecture. Saviez-vous que vous pouvez utiliser des types JSON natifs pour stocker des métadonnées complexes ?\n\n\`\`\`typescript\nimport { BaseSchema } from '@adonisjs/lucid/schema'\n\nexport default class extends BaseSchema {\n  protected tableName = 'orders'\n\n  async up() {\n    this.schema.createTable(this.tableName, (table) => {\n      table.increments('id')\n      table.jsonb('metadata')\n      table.timestamp('created_at')\n    })\n  }\n}\n\`\`\``
              },
              {
                title: 'Requêtes de Haute Précision',
                content: `Le problème du N+1 est le tueur silencieux des performances. Lucid résout cela avec le "Preloading".\n\n\`\`\`typescript\nconst users = await User.query().preload('courses', (query) => {\n  query.where('status', 'published')\n})\n\`\`\`\n\nIci, nous récupérons tous les utilisateurs ET leurs cours publiés en seulement deux requêtes SQL optimisées.`
              }
            ],
            exercises: [
              'Écrivez une requête avec Lucifer pour récupérer le top 3 des modules ayant le plus de leçons.',
              'Mettez en place une relation Many-To-Many "Apprenants" <-> "Classes".'
            ]
          },
          {
            title: 'Module 3 : Sécurité Militaire & Authentification',
            lessons: [
              {
                title: 'Session vs JWT : Le Grand Débat',
                content: `Pour la plupart des applications web AdonisJS 6, les sessions cryptées sont le meilleur compromis sécurité/simplicité. Pourquoi ?\n- Facilité de révocation.\n- Protection CSRF intégrée.\n- Pas de stockage de tokens sensibles dans le localStorage.\n\nAdonis utilise @adonisjs/auth pour gérer cela sans aucun effort. Le package gère même le hashage des mots de passe avec Argon2 par défaut.`
              },
              {
                title: 'Validation avec VineJS',
                content: `Ne faites jamais confiance aux données utilisateur. VineJS est le validateur le plus rapide du marché Node.js, optimisé par compilation JIT.\n\n\`\`\`typescript\nexport const createUserValidator = vine.compile(\n  vine.object({\n    email: vine.string().email(),\n    password: vine.string().minLength(8)\n  })\n)\n\`\`\``
              }
            ],
            exercises: [
              'Créez un validateur qui interdit l\'utilisation de domaines d\'email jetables.',
              'Configurez une politique de sécurité (Policy) pour empêcher un utilisateur de supprimer le cours d\'un autre.'
            ]
          },
          {
            title: 'Module 4 : Interface Utilisateur & EdgeJS',
            lessons: [
              {
                title: 'Composants Réutilisables',
                content: `EdgeJS est bien plus qu'un moteur de templates. C'est un langage de présentation. Utilisez les @slots et les @component pour créer une interface flexible.\n\nL'avantage d'Edge sur React ou Vue pour les apps Adonis est son rendu côté serveur (SSR) instantané et son SEO parfait sans configuration.`
              }
            ],
            exercises: [
              'Créez un composant "Badge" qui change de couleur selon le statut du cours.',
              'Implémentez une mise en page "Dashbord" différente de la mise en page "Public".'
            ]
          },
          {
            title: 'Module 5 : Production & Performance',
            lessons: [
              {
                title: 'Optimisation Turbo',
                content: `Découvrez comment utiliser Redis pour le caching et les files d'attente (Queues). Adonis dispose de packages officiels pour transformer une application standard en un monstre capable de gérer des milliers de requêtes par seconde.`
              }
            ],
            exercises: [
              'Mettre en place un cache de 5 minutes sur la liste des cours populaires.',
              'Déployer l\'application sur un serveur VPS avec Docker.'
            ]
          }
        ]
      }
    })

    // Autres cours pour remplir la bibliothèque
    await Course.create({
      title: 'Design UI Moderne : Maîtriser Tailwind CSS',
      slug: 'design-ui-moderne-tailwind-css',
      description: 'Apprenez à concevoir des interfaces époustouflantes sans jamais quitter votre fichier HTML. Du responsive design aux animations complexes.',
      status: 'ready',
      content: {
        level: 'Intermédiaire',
        image: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=1200&q=80',
        modules: [
          {
            title: 'Les Fondamentaux du Utility-First',
            lessons: [{ title: 'Pourquoi pas de CSS classique ?', content: 'Tailwind évite la duplication et les noms de classes inutiles...' }]
          }
        ]
      }
    })
  }
}