import env from '#start/env'
import Course from '#models/course'
import AiProviderService from '#services/ai_provider_service'
import User from '#models/user'
import app from '@adonisjs/core/services/app'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export default class PodcastService {
  /**
   * Generates a podcast (summary) for a course using AI and saves it.
   */
  static async generatePodcast(course: Course, user: User) {
    if (course.podcastUrl) return course.podcastUrl

    const apiKey = env.get('OPENAI_API_KEY')
    if (!apiKey) return null

    try {
      // 1. Générer le script du podcast avec l'IA du cours
      const scriptPrompt = `
        Tu es un podcasteur expert. Rédige un script de narration captivant pour résumer le cours suivant : "${course.title}".
        Le but est de donner envie d'apprendre et de résumer les points clés en environ 2-3 minutes de parole (environ 400 mots).
        Utilise un ton enthousiaste, pédagogue et moderne.
        Réponds UNIQUEMENT avec le texte à lire, sans indications de mise en scène.
        
        Voici le contenu du cours pour t'aider :
        ${JSON.stringify(course.content?.description)}
        ${course.content?.modules?.map((m: any) => m.title).join(', ')}
      `

      const script = await AiProviderService.generateText(scriptPrompt, user)

      // 2. Transformer le script en audio via OpenAI TTS
      const ttsResponse = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: script,
          voice: 'alloy', // onyx, nova, shimer .. alloy est neutre et clair
          speed: 1.0
        })
      })

      if (!ttsResponse.ok) {
        const err = await ttsResponse.json() as any
        throw new Error(`OpenAI TTS Error: ${err.error?.message || ttsResponse.statusText}`)
      }

      const audioBuffer = await ttsResponse.arrayBuffer()

      // 3. Sauvegarder le fichier localement
      const fileName = `podcast_${course.id}_${Date.now()}.mp3`
      const publicPath = app.publicPath('uploads/podcasts')

      // Créer le dossier s'il n'existe pas
      await mkdir(publicPath, { recursive: true })

      const filePath = join(publicPath, fileName)
      await writeFile(filePath, Buffer.from(audioBuffer))

      // 4. Mettre à jour le cours
      course.podcastUrl = `/uploads/podcasts/${fileName}`
      await course.save()

      console.log(`[PodcastService] Podcast généré avec succès : ${course.podcastUrl}`)
      return course.podcastUrl
    } catch (error) {
      console.error('[PodcastService] Erreur lors de la génération du podcast :', error)
      return null
    }
  }
}