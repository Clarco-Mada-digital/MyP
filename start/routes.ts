/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const HomeController = () => import('#controllers/home_controller')
const AuthController = () => import('#controllers/auth_controller')
const CoursesController = () => import('#controllers/courses_controller')
const ProgressesController = () => import('#controllers/progresses_controller')
const SettingsController = () => import('#controllers/settings_controller')
const AdminController = () => import('#controllers/admin_controller')
const AdminCourseDeletionController = () => import('#controllers/admin/course_deletion_controller')
const CategoriesController = () => import('#controllers/categories_controller')

router.get('/', [HomeController, 'index'])

router.group(() => {
  router.get('/register', [AuthController, 'registerPage']).use(middleware.guest())
  router.post('/register', [AuthController, 'register']).use(middleware.guest())
  router.get('/login', [AuthController, 'loginPage']).use(middleware.guest())
  router.post('/login', [AuthController, 'login']).use(middleware.guest())
  router.post('/logout', [AuthController, 'logout']).use(middleware.auth())
})

router.group(() => {
  router.get('/mes-cours', [CoursesController, 'myCourses'])
  router.post('/courses/generate', [CoursesController, 'generate'])
  router.get('/courses/confirm', [CoursesController, 'confirm']).as('courses.confirm')
  router.post('/courses/:id/delete', [CoursesController, 'destroy'])
  router.post('/courses/:id/request-deletion', [CoursesController, 'requestDeletion']).as('courses.requestDeletion')
  router.post('/progress/toggle', [ProgressesController, 'toggle'])
  router.post('/courses/:id/sync', [CoursesController, 'syncLocalContent']).as('courses.sync')
  router.post('/courses/:id/bookmark', [CoursesController, 'toggleBookmark']).as('courses.bookmark')
  router.get('/settings', [SettingsController, 'index'])
  router.post('/settings', [SettingsController, 'update'])
  router.post('/settings/profile', [SettingsController, 'updateProfile'])
  router.post('/settings/password', [SettingsController, 'updatePassword'])
  router.post('/settings/test-key', [SettingsController, 'testKey'])
  router.get('/admin', [AdminController, 'index']).as('admin.dashboard')
  router.get('/admin/users', [AdminController, 'users']).as('admin.users')
  router.post('/admin/users/:id/toggle-admin', [AdminController, 'toggleAdmin']).as('admin.users.toggle')
  router.get('/admin/courses', [AdminController, 'courses']).as('admin.courses')
  router.post('/admin/courses/assign-default', [AdminController, 'assignDefaultCategories']).as('admin.courses.assign-default')
  router.post('/admin/courses/:id/category', [AdminController, 'updateCourseCategory']).as('admin.courses.category')
  router.post('/admin/courses/:id/delete', [AdminController, 'deleteCourse']).as('admin.courses.delete')
  router.post('/admin/courses/:id/image', [AdminController, 'updateCourseImage']).as('admin.courses.image')
  router.get('/admin/categories', [CategoriesController, 'adminIndex']).as('admin.categories')
  router.get('/admin/categories/create', [CategoriesController, 'create']).as('admin.categories.create')
  router.post('/admin/categories', [CategoriesController, 'store'])
  router.get('/admin/categories/:id/edit', [CategoriesController, 'edit']).as('admin.categories.edit')
  router.post('/admin/categories/:id', [CategoriesController, 'update']).as('admin.categories.update')
  router.post('/admin/categories/:id/delete', [CategoriesController, 'destroy']).as('admin.categories.delete')

  // Backups
  router.get('/admin/backup/download', [AdminController, 'downloadBackup']).as('admin.backup.download')
  router.post('/admin/backup/restore', [AdminController, 'restoreBackup']).as('admin.backup.restore')

  // Global AI Settings
  router.get('/admin/settings', [AdminController, 'settings']).as('admin.settings')
  router.post('/admin/settings', [AdminController, 'updateSettings']).as('admin.settings.update')

  // Learning Paths Admin
  router.get('/admin/learning-paths', '#controllers/admin/learning_paths_controller.index').as('admin.learning_paths.index')
  router.get('/admin/learning-paths/create', '#controllers/admin/learning_paths_controller.create').as('admin.learning_paths.create')
  router.post('/admin/learning-paths', '#controllers/admin/learning_paths_controller.store').as('admin.learning_paths.store')
  router.get('/admin/learning-paths/:id/edit', '#controllers/admin/learning_paths_controller.edit').as('admin.learning_paths.edit')
  router.post('/admin/learning-paths/:id', '#controllers/admin/learning_paths_controller.update').as('admin.learning_paths.update')
  router.post('/admin/learning-paths/:id/add-course', '#controllers/admin/learning_paths_controller.addCourse').as('admin.learning_paths.add_course')
  router.post('/admin/learning-paths/:id/reorder', '#controllers/admin/learning_paths_controller.reorder').as('admin.learning_paths.reorder')
  router.post('/admin/learning-paths/:id/remove-course', '#controllers/admin/learning_paths_controller.removeCourse').as('admin.learning_paths.remove_course')
  router.post('/admin/learning-paths/:id/delete', '#controllers/admin/learning_paths_controller.destroy').as('admin.learning_paths.delete')

  // Course Deletion Requests
  router.get('/admin/course-deletions', [AdminCourseDeletionController, 'index']).as('admin.course_deletions')
  router.post('/admin/course-deletions/:id/approve', [AdminCourseDeletionController, 'approve']).as('admin.course_deletions.approve')
  router.post('/admin/course-deletions/:id/reject', [AdminCourseDeletionController, 'reject']).as('admin.course_deletions.reject')

  // Course Chat
  router.post('/courses/chat', '#controllers/course_chats_controller.sendMessage').as('courses.chat.send')
  router.get('/courses/:id/chat/history', '#controllers/course_chats_controller.getHistory').as('courses.chat.history')
}).use(middleware.auth())

router.group(() => {
  router.get('/parcourir', [CoursesController, 'browse'])
  router.get('/categories', [CategoriesController, 'index'])
  router.get('/categories/:slug', [CategoriesController, 'show'])
  router.get('/courses/:slug', [CoursesController, 'show']).as('courses.show')
  router.get('/courses/:slug/flashcards', [CoursesController, 'flashcards']).as('courses.flashcards')
  router.get('/dashboard', '#controllers/dashboard_controller.index').as('dashboard').use(middleware.auth())
  router.get('/parcours', '#controllers/learning_paths_controller.index').as('learning_paths.index')
  router.get('/parcours/:slug', '#controllers/learning_paths_controller.show').as('learning_paths.show')
  router.on('/conditions').render('pages/legal/terms')
  router.on('/confidentialite').render('pages/legal/privacy')
  router.on('/a-propos').render('pages/legal/about')
})
