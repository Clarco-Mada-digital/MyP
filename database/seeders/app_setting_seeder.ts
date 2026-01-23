import { BaseSeeder } from '@adonisjs/lucid/seeders'
import ApplicationSetting from '#models/application_setting'

export default class extends BaseSeeder {
  async run() {
    await ApplicationSetting.updateOrCreate(
      { key: 'active_cloud_provider' },
      { value: 'gemini' }
    )
  }
}