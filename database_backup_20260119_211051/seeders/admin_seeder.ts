import { BaseSeeder } from '@adonisjs/lucid/seeders'

export default class extends BaseSeeder {
  async run() {
    const { default: User } = await import('#models/user')

    await User.updateOrCreate(
      { email: 'admin@myp.com' },
      {
        fullName: 'Administrateur',
        password: 'password123',
        isAdmin: true,
        aiProvider: 'gemini',
        aiModel: 'gemini-flash-latest'
      }
    )
  }
}