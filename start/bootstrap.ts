/*
|--------------------------------------------------------------------------
| Bootstrap file
|--------------------------------------------------------------------------
|
| The bootstrap file is used to initialize services and setup
| the application when it starts.
|
*/

import BackupScheduler from '#services/backup_scheduler'

export async function bootstrap() {
  // Démarrer le planificateur de sauvegardes automatiques
  await BackupScheduler.start()
}
