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
  router.get('/courses/generate', [CoursesController, 'generate'])
  router.post('/courses/:id/delete', [CoursesController, 'destroy'])
  router.post('/progress/toggle', [ProgressesController, 'toggle'])
}).use(middleware.auth())

router.group(() => {
  router.get('/parcourir', [CoursesController, 'browse'])
  router.get('/courses/:slug', [CoursesController, 'show'])
})
