import type { HttpContext } from '@adonisjs/core/http'
import CourseDeletionRequest from '#models/course_deletion_request'
import Course from '#models/course'
import db from '@adonisjs/lucid/services/db'

export default class AdminCourseDeletionController {
  /**
   * Show all deletion requests
   */
  async index({ view, auth }: HttpContext) {
    await auth.check()
    
    const requests = await CourseDeletionRequest.query()
      .preload('course')
      .preload('user')
      .orderBy('created_at', 'desc')

    return view.render('admin/course_deletions/index', { requests })
  }

  /**
   * Approve deletion request
   */
  async approve({ params, response, session }: HttpContext) {
    const request = await CourseDeletionRequest.findOrFail(params.id)
    
    // Supprimer le cours
    const course = await Course.find(request.courseId)
    if (course) {
      await course.delete()
    }

    // Mettre à jour le statut de la demande
    request.status = 'approved'
    request.adminNote = 'Suppression approuvée par l\'administrateur'
    await request.save()

    session.flash('notification', { 
      type: 'success', 
      message: '✅ Cours supprimé avec succès !' 
    })
    return response.redirect().back()
  }

  /**
   * Reject deletion request
   */
  async reject({ params, request, response, session }: HttpContext) {
    const deletionRequest = await CourseDeletionRequest.findOrFail(params.id)
    
    deletionRequest.status = 'rejected'
    deletionRequest.adminNote = request.input('adminNote') || 'Demande rejetée par l\'administrateur'
    await deletionRequest.save()

    session.flash('notification', { 
      type: 'info', 
      message: '❌ Demande de suppression rejetée.' 
    })
    return response.redirect().back()
  }
}
