import type { HttpContext } from '@adonisjs/core/http'
import Course from '#models/course'
import CourseChat from '#models/course_chat'
import GeminiService from '#services/gemini_service'
import OllamaService from '#services/ollama_service'
import env from '#start/env'

export default class CourseChatsController {
  /**
   * Envoyer un message au tuteur IA
   */
  async sendMessage({ request, response, auth }: HttpContext) {
    const user = auth.user!
    const courseId = request.input('course_id')
    const message = request.input('message')

    if (!message) return response.badRequest('Message vide')

    const course = await Course.findOrFail(courseId)

    // 1. Sauvegarder le message de l'utilisateur
    await CourseChat.create({
      userId: user.id,
      courseId: course.id,
      role: 'user',
      content: message
    })

    // 2. Récupérer l'historique récent (10 derniers messages) pour le contexte
    const history = await CourseChat.query()
      .where('userId', user.id)
      .where('courseId', course.id)
      .orderBy('createdAt', 'asc')
      .limit(10)

    // 3. Préparer le prompt avec le contenu du cours
    const courseContext = JSON.stringify(course.content)
    const chatHistory = history.map(h => `${h.role === 'user' ? 'Étudiant' : 'Tuteur'}: ${h.content}`).join('\n')

    const systemPrompt = `Tu es "My Professor AI", un tuteur expert et bienveillant. 
    Ton but est d'aider l'étudiant à comprendre le cours suivant : "${course.title}".
    
    CONTEXTE DU COURS :
    ${courseContext}
    
    HISTORIQUE DE LA DISCUSSION :
    ${chatHistory}
    
    CONSIGNES :
    - Réponds de manière concise et pédagogique.
    - Utilise le contexte du cours pour tes réponses.
    - Si la question n'a aucun rapport avec le cours, ramène gentiment l'étudiant vers le sujet.
    - Utilise le Markdown pour formater tes réponses (gras, listes, code).
    - Sois encourageant !`

    let aiResponse = ''

    try {
      const useGemini = env.get('GEMINI_API_KEY')
      if (useGemini) {
        aiResponse = await GeminiService.generateText(`${systemPrompt}\n\nÉtudiant: ${message}\nTuteur:`)
      } else {
        aiResponse = await OllamaService.generateText(`${systemPrompt}\n\nÉtudiant: ${message}\nTuteur:`, 'llama3')
      }

      // 4. Sauvegarder la réponse de l'IA
      const assistantMessage = await CourseChat.create({
        userId: user.id,
        courseId: course.id,
        role: 'assistant',
        content: aiResponse
      })

      return response.ok({
        role: 'assistant',
        content: aiResponse,
        createdAt: assistantMessage.createdAt
      })
    } catch (error) {
      console.error('Chat AI Error:', error)
      return response.internalServerError('Désolé, je rencontre une petite difficulté technique.')
    }
  }

  /**
   * Récupérer l'historique du chat
   */
  async getHistory({ params, auth, response }: HttpContext) {
    const user = auth.user!
    const courseId = params.id

    const history = await CourseChat.query()
      .where('userId', user.id)
      .where('courseId', courseId)
      .orderBy('createdAt', 'asc')

    return response.ok(history)
  }
}