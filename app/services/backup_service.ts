import Env from '#start/env'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import DatabaseBackup from '#models/database_backup'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import { DateTime } from 'luxon'

const execAsync = promisify(exec)

export default class BackupService {
  /**
   * Crée une sauvegarde complète de la base de données MySQL
   */
  static async createBackup(type: 'manual' | 'automatic' = 'manual'): Promise<DatabaseBackup> {
    const backup = new DatabaseBackup()
    backup.type = type
    backup.status = 'pending'
    
    const timestamp = DateTime.now().toFormat('yyyy-MM-dd_HH-mm-ss')
    backup.filename = `backup_${type}_${timestamp}.sql`
    backup.filepath = path.join(app.tmpPath('backups'), backup.filename)
    
    await backup.save()

    try {
      // Créer le répertoire de sauvegarde s'il n'existe pas
      await fs.mkdir(path.dirname(backup.filepath), { recursive: true })

      // Vérifier si on utilise MySQL
      if (Env.get('DB_CONNECTION') !== 'mysql') {
        throw new Error('La sauvegarde automatique n\'est disponible que pour MySQL')
      }

      // Construire la commande mysqldump
      const mysqldumpCmd = `mysqldump -h ${Env.get('DB_HOST')} -P ${Env.get('DB_PORT')} -u ${Env.get('DB_USER')} -p${Env.get('DB_PASSWORD')} ${Env.get('DB_DATABASE')} > "${backup.filepath}"`

      // Exécuter la sauvegarde
      await execAsync(mysqldumpCmd)

      // Vérifier que le fichier a été créé
      const stats = await fs.stat(backup.filepath)
      backup.size = stats.size
      backup.status = 'completed'

      // Obtenir la liste des tables sauvegardées
      const tables = await this.getDatabaseTables()
      backup.tables = tables.join(',')

      await backup.save()

      // Nettoyer les anciennes sauvegardes automatiques (garder seulement les 10 dernières)
      if (type === 'automatic') {
        await this.cleanupOldBackups()
      }

      return backup

    } catch (error) {
      backup.status = 'failed'
      backup.errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
      await backup.save()
      throw error
    }
  }

  /**
   * Restaure une sauvegarde à partir d'un fichier
   */
  static async restoreBackup(filepath: string): Promise<void> {
    try {
      if (Env.get('DB_CONNECTION') !== 'mysql') {
        throw new Error('La restauration n\'est disponible que pour MySQL')
      }

      // Construire la commande mysql
      const mysqlCmd = `mysql -h ${Env.get('DB_HOST')} -P ${Env.get('DB_PORT')} -u ${Env.get('DB_USER')} -p${Env.get('DB_PASSWORD')} ${Env.get('DB_DATABASE')} < "${filepath}"`

      // Exécuter la restauration
      await execAsync(mysqlCmd)

    } catch (error) {
      throw new Error(`Erreur lors de la restauration: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
    }
  }

  /**
   * Obtient la liste des tables dans la base de données
   */
  static async getDatabaseTables(): Promise<string[]> {
    try {
      const result = await db.rawQuery('SHOW TABLES')
      return result.map((row: any) => Object.values(row)[0] as string)
    } catch (error) {
      console.error('Erreur lors de la récupération des tables:', error)
      return []
    }
  }

  /**
   * Nettoie les anciennes sauvegardes automatiques
   */
  static async cleanupOldBackups(): Promise<void> {
    try {
      const oldBackups = await DatabaseBackup.query()
        .where('type', 'automatic')
        .where('status', 'completed')
        .orderBy('createdAt', 'desc')
        .offset(10) // Garder les 10 plus récentes

      for (const backup of oldBackups) {
        try {
          // Supprimer le fichier
          await fs.unlink(backup.filepath)
        } catch (error) {
          console.error(`Erreur lors de la suppression du fichier ${backup.filepath}:`, error)
        }
        
        // Supprimer l'enregistrement en base
        await backup.delete()
      }
    } catch (error) {
      console.error('Erreur lors du nettoyage des anciennes sauvegardes:', error)
    }
  }

  /**
   * Obtient la liste des sauvegardes disponibles
   */
  static async getBackups(): Promise<DatabaseBackup[]> {
    return await DatabaseBackup.query().orderBy('createdAt', 'desc')
  }

  /**
   * Supprime une sauvegarde
   */
  static async deleteBackup(id: number): Promise<void> {
    const backup = await DatabaseBackup.findOrFail(id)
    
    try {
      // Supprimer le fichier
      await fs.unlink(backup.filepath)
    } catch (error) {
      console.error(`Erreur lors de la suppression du fichier ${backup.filepath}:`, error)
    }
    
    // Supprimer l'enregistrement en base
    await backup.delete()
  }

  /**
   * Télécharge une sauvegarde
   */
  static async downloadBackup(id: number): Promise<{ filepath: string; filename: string }> {
    const backup = await DatabaseBackup.findOrFail(id)
    
    if (backup.status !== 'completed') {
      throw new Error('Cette sauvegarde n\'est pas disponible au téléchargement')
    }

    return {
      filepath: backup.filepath,
      filename: backup.filename
    }
  }
}
