import ApplicationSetting from '#models/application_setting'
import BackupService from '#services/backup_service'
import { DateTime } from 'luxon'
import { schedule } from 'node-cron'

export default class BackupScheduler {
  private static isRunning = false

  /**
   * Démarre le planificateur de sauvegardes automatiques
   */
  static async start(): Promise<void> {
    if (this.isRunning) {
      return
    }

    this.isRunning = true

    // Vérifier toutes les heures si une sauvegarde automatique est nécessaire
    schedule('0 * * * *', async () => {
      await this.checkAndRunBackup()
    })

    console.log('📅 Planificateur de sauvegardes automatiques démarré')
  }

  /**
   * Vérifie si une sauvegarde automatique doit être exécutée et l'exécute si nécessaire
   */
  static async checkAndRunBackup(): Promise<void> {
    try {
      const autoBackupEnabled = await ApplicationSetting.getValue('auto_backup_enabled', 'false') === 'true'
      
      if (!autoBackupEnabled) {
        return
      }

      const frequency = await ApplicationSetting.getValue('backup_frequency', 'daily')
      const lastBackupTime = await this.getLastBackupTime()
      
      const now = DateTime.now()
      let shouldRun = false

      switch (frequency) {
        case 'daily':
          shouldRun = !lastBackupTime || now.diff(lastBackupTime, 'days').days >= 1
          break
        case 'weekly':
          shouldRun = !lastBackupTime || now.diff(lastBackupTime, 'weeks').weeks >= 1
          break
        case 'monthly':
          shouldRun = !lastBackupTime || now.diff(lastBackupTime, 'months').months >= 1
          break
      }

      if (shouldRun) {
        console.log(`🔄 Lancement de la sauvegarde automatique (${frequency})`)
        await BackupService.createBackup('automatic')
        console.log('✅ Sauvegarde automatique terminée')
      }

    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde automatique:', error)
    }
  }

  /**
   * Obtient la date de la dernière sauvegarde automatique réussie
   */
  static async getLastBackupTime(): Promise<DateTime | null> {
    try {
      const DatabaseBackup = (await import('#models/database_backup')).default
      const lastBackup = await DatabaseBackup.query()
        .where('type', 'automatic')
        .where('status', 'completed')
        .orderBy('createdAt', 'desc')
        .first()

      return lastBackup?.createdAt || null
    } catch (error) {
      console.error('Erreur lors de la récupération de la dernière sauvegarde:', error)
      return null
    }
  }

  /**
   * Arrête le planificateur
   */
  static stop(): void {
    this.isRunning = false
    console.log('🛑 Planificateur de sauvegardes automatiques arrêté')
  }

  /**
   * Obtient le statut du planificateur
   */
  static getStatus(): boolean {
    return this.isRunning
  }
}
