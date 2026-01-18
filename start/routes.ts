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
  router.post('/progress/toggle', [ProgressesController, 'toggle'])
  router.get('/settings', [SettingsController, 'index'])
  router.post('/settings', [SettingsController, 'update'])
  router.get('/admin', [AdminController, 'index']).as('admin.dashboard')
  router.get('/admin/users', [AdminController, 'users']).as('admin.users')
  router.post('/admin/users/:id/toggle-admin', [AdminController, 'toggleAdmin']).as('admin.users.toggle')
  router.get('/admin/courses', [AdminController, 'courses']).as('admin.courses')
  router.post('/admin/courses/assign-default', [AdminController, 'assignDefaultCategories']).as('admin.courses.assign-default')
  router.post('/admin/courses/:id/category', [AdminController, 'updateCourseCategory']).as('admin.courses.category')
  router.post('/admin/courses/:id/delete', [AdminController, 'deleteCourse']).as('admin.courses.delete')
  router.get('/admin/categories', [CategoriesController, 'adminIndex']).as('admin.categories')
  router.get('/admin/categories/create', [CategoriesController, 'create']).as('admin.categories.create')
  router.post('/admin/categories', [CategoriesController, 'store'])
  router.get('/admin/categories/:id/edit', [CategoriesController, 'edit']).as('admin.categories.edit')
  router.post('/admin/categories/:id/delete', [CategoriesController, 'destroy']).as('admin.categories.delete')
}).use(middleware.auth())

router.group(() => {
  router.get('/parcourir', [CoursesController, 'browse'])
  router.get('/categories', [CategoriesController, 'index'])
  router.get('/categories/:slug', [CategoriesController, 'show'])
  router.get('/courses/:slug', [CoursesController, 'show']).as('courses.show')
})
