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
   * Crée une sauvegarde complète de la base de données
   */
  static async createBackup(type: 'manual' | 'automatic' = 'manual'): Promise<DatabaseBackup> {
    const backup = new DatabaseBackup()
    backup.type = type
    backup.status = 'pending'
    
    const timestamp = DateTime.now().toFormat('yyyy-MM-dd_HH-mm-ss')
    const dbConnection = Env.get('DB_CONNECTION')
    
    if (dbConnection === 'mysql') {
      backup.filename = `backup_${type}_${timestamp}.sql`
      backup.filepath = path.join(app.tmpPath('backups'), backup.filename)
    } else if (dbConnection === 'sqlite') {
      backup.filename = `backup_${type}_${timestamp}.sqlite3`
      backup.filepath = path.join(app.tmpPath('backups'), backup.filename)
    } else {
      throw new Error(`Type de base de données non supporté: ${dbConnection}`)
    }
    
    await backup.save()

    try {
      // Créer le répertoire de sauvegarde s'il n'existe pas
      await fs.mkdir(path.dirname(backup.filepath), { recursive: true })

      if (dbConnection === 'mysql') {
        // Sauvegarde MySQL : essayer mysqldump d'abord, sinon utiliser Knex
        try {
          const mysqldumpCmd = `mysqldump -h ${Env.get('DB_HOST')} -P ${Env.get('DB_PORT')} -u ${Env.get('DB_USER')} -p${Env.get('DB_PASSWORD')} ${Env.get('DB_DATABASE')} > "${backup.filepath}"`
          await execAsync(mysqldumpCmd)
          console.log('✅ Sauvegarde MySQL créée avec mysqldump')
        } catch (error) {
          // Si mysqldump n'est pas disponible, utiliser Knex pour générer le dump
          console.log('⚠️ mysqldump non disponible, utilisation de Knex pour le dump...')
          await this.createKnexDump(backup.filepath)
        }
        
        // Obtenir la liste des tables sauvegardées
        const tables = await this.getDatabaseTables()
        backup.tables = tables.join(',')
      } else if (dbConnection === 'sqlite') {
        // Sauvegarde SQLite : copie simple du fichier
        const dbPath = app.tmpPath('db.sqlite3')
        await fs.copyFile(dbPath, backup.filepath)
        
        // Obtenir la liste des tables pour SQLite
        const tables = await this.getDatabaseTables()
        backup.tables = tables.join(',')
      }

      // Vérifier que le fichier a été créé
      const stats = await fs.stat(backup.filepath)
      backup.size = stats.size
      backup.status = 'completed'

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
   * Crée un dump SQL en utilisant Knex (alternative à mysqldump)
   */
  static async createKnexDump(filepath: string): Promise<void> {
    try {
      const tables = await this.getDatabaseTables()
      let sqlDump = ''
      
      // En-tête du dump
      sqlDump += `-- Dump SQL généré le ${DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss')}\n`
      sqlDump += `-- Base de données: ${Env.get('DB_DATABASE')}\n\n`
      
      for (const table of tables) {
        // Obtenir la structure de la table
        const createTableSQL = await this.getTableStructure(table)
        sqlDump += `-- Structure de la table \`${table}\`\n`
        sqlDump += `DROP TABLE IF EXISTS \`${table}\`;\n`
        sqlDump += createTableSQL + ';\n\n'
        
        // Obtenir les données de la table
        const insertSQL = await this.getTableData(table)
        if (insertSQL) {
          sqlDump += `-- Données de la table \`${table}\`\n`
          sqlDump += insertSQL + '\n\n'
        }
      }
      
      // Écrire le dump dans le fichier
      await fs.writeFile(filepath, sqlDump, 'utf8')
      
    } catch (error) {
      throw new Error(`Erreur lors de la création du dump Knex: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
    }
  }

  /**
   * Obtient la structure d'une table
   */
  static async getTableStructure(tableName: string): Promise<string> {
    try {
      const dbConnection = Env.get('DB_CONNECTION')
      
      if (typeof tableName !== 'string') {
        console.error('Nom de table invalide:', tableName)
        return ''
      }
      
      if (dbConnection === 'sqlite') {
        return await this.getSQLiteTableStructure(tableName)
      } else if (dbConnection === 'mysql') {
        return await this.getMySQLTableStructure(tableName)
      } else {
        throw new Error(`Type de base de données non supporté: ${dbConnection}`)
      }
    } catch (error) {
      console.error(`Erreur lors de l'obtention de la structure de ${tableName}:`, error)
      return ''
    }
  }

  /**
   * Obtient la structure d'une table SQLite
   */
  static async getSQLiteTableStructure(tableName: string): Promise<string> {
    try {
      const result = await db.rawQuery(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${tableName}'`)
      return result.length > 0 ? result[0].sql : ''
    } catch (error) {
      console.error(`Erreur lors de l'obtention de la structure SQLite de ${tableName}:`, error)
      return ''
    }
  }

  /**
   * Obtient la structure d'une table MySQL
   */
  static async getMySQLTableStructure(tableName: string): Promise<string> {
    try {
      const result = await db.raw(`SHOW CREATE TABLE \`${tableName}\``) as unknown as any[]
      
      if (!result || result.length === 0 || !result[0]) {
        console.error(`Structure de table MySQL non trouvée pour: ${tableName}`)
        return ''
      }
      
      const firstRow = result[0]
      
      // Chercher la propriété contenant le SQL CREATE TABLE
      let createTableSql = ''
      
      // Essayer les noms de propriétés communs
      if ('Create Table' in firstRow) {
        createTableSql = firstRow['Create Table']
      } else if ('Create Table' in firstRow) {
        createTableSql = firstRow['Create Table']
      } else {
        // Chercher dans toutes les propriétés
        for (const key in firstRow) {
          if (key.toLowerCase().includes('create') && typeof firstRow[key] === 'string') {
            createTableSql = firstRow[key]
            break
          }
        }
      }
      
      if (!createTableSql) {
        console.error(`Propriété 'Create Table' non trouvée dans le résultat pour: ${tableName}`, firstRow)
        return ''
      }
      
      return createTableSql
    } catch (error) {
      console.error(`Erreur lors de l'obtention de la structure MySQL de ${tableName}:`, error)
      return ''
    }
  }

  /**
   * Obtient les données d'une table au format INSERT
   */
  static async getTableData(tableName: string): Promise<string> {
    try {
      const dbConnection = Env.get('DB_CONNECTION')
      
      if (typeof tableName !== 'string') {
        console.error('Nom de table invalide:', tableName)
        return ''
      }
      
      if (dbConnection === 'sqlite') {
        return await this.getSQLiteTableData(tableName)
      } else if (dbConnection === 'mysql') {
        return await this.getMySQLTableData(tableName)
      } else {
        throw new Error(`Type de base de données non supporté: ${dbConnection}`)
      }
    } catch (error) {
      console.error(`Erreur lors de l'obtention des données de ${tableName}:`, error)
      return ''
    }
  }

  /**
   * Obtient les données d'une table SQLite au format INSERT
   */
  static async getSQLiteTableData(tableName: string): Promise<string> {
    try {
      const rows = await db.from(tableName).select('*')
      if (rows.length === 0) {
        return ''
      }
      
      const columns = Object.keys(rows[0])
      let insertSQL = `INSERT INTO \`${tableName}\` (\`${columns.join('`, `')}\`) VALUES\n`
      
      const values = rows.map(row => {
        const values = columns.map(col => {
          const value = row[col]
          if (value === null) return 'NULL'
          if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'` // SQLite utilise '' pour échapper
          if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`
          return value
        })
        return `(${values.join(', ')})`
      })
      
      insertSQL += values.join(',\n') + ';'
      return insertSQL
      
    } catch (error) {
      console.error(`Erreur lors de l'obtention des données SQLite de ${tableName}:`, error)
      return ''
    }
  }

  /**
   * Obtient les données d'une table MySQL au format INSERT
   */
  static async getMySQLTableData(tableName: string): Promise<string> {
    try {
      const rows = await db.from(tableName).select('*')
      if (rows.length === 0) {
        return ''
      }
      
      const columns = Object.keys(rows[0])
      let insertSQL = `INSERT INTO \`${tableName}\` (\`${columns.join('`, `')}\`) VALUES\n`
      
      const values = rows.map(row => {
        const values = columns.map(col => {
          const value = row[col]
          if (value === null) return 'NULL'
          if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'` // MySQL utilise \' pour échapper
          if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "\\'")}'`
          return value
        })
        return `(${values.join(', ')})`
      })
      
      insertSQL += values.join(',\n') + ';'
      return insertSQL
      
    } catch (error) {
      console.error(`Erreur lors de l'obtention des données MySQL de ${tableName}:`, error)
      return ''
    }
  }

  /**
   * Restaure une sauvegarde à partir d'un fichier
   */
  static async restoreBackup(filepath: string): Promise<void> {
    try {
      const dbConnection = Env.get('DB_CONNECTION')
      
      if (dbConnection === 'mysql') {
        // Restauration MySQL
        const mysqlCmd = `mysql -h ${Env.get('DB_HOST')} -P ${Env.get('DB_PORT')} -u ${Env.get('DB_USER')} -p${Env.get('DB_PASSWORD')} ${Env.get('DB_DATABASE')} < "${filepath}"`
        await execAsync(mysqlCmd)
      } else if (dbConnection === 'sqlite') {
        // Restauration SQLite : copie du fichier
        const dbPath = app.tmpPath('db.sqlite3')
        await fs.copyFile(filepath, dbPath)
      } else {
        throw new Error(`Type de base de données non supporté: ${dbConnection}`)
      }

    } catch (error) {
      throw new Error(`Erreur lors de la restauration: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
    }
  }

  /**
   * Obtient la liste des tables dans la base de données
   */
  static async getDatabaseTables(): Promise<string[]> {
    try {
      const dbConnection = Env.get('DB_CONNECTION')
      
      if (dbConnection === 'sqlite') {
        return await this.getSQLiteTables()
      } else if (dbConnection === 'mysql') {
        return await this.getMySQLTables()
      } else {
        throw new Error(`Type de base de données non supporté: ${dbConnection}`)
      }
    } catch (error) {
      console.error('Erreur lors de la récupération des tables:', error)
      return []
    }
  }

  /**
   * Obtient les tables pour SQLite
   */
  static async getSQLiteTables(): Promise<string[]> {
    try {
      const result = await db.rawQuery("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      return result.map((row: any) => row.name as string)
    } catch (error) {
      console.error('Erreur lors de la récupération des tables SQLite:', error)
      return []
    }
  }

  /**
   * Obtient les tables pour MySQL
   */
  static async getMySQLTables(): Promise<string[]> {
    try {
      // Utiliser INFORMATION_SCHEMA pour une approche plus standard
      const result = await db.rawQuery(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = '${Env.get('DB_DATABASE')}'
        AND TABLE_TYPE = 'BASE TABLE'
      `) as unknown as any[]
      
      // Le résultat contient deux tableaux : le premier avec les données, le deuxième avec les métadonnées
      // On ne veut que le premier tableau qui contient les vraies données
      const dataArray = Array.isArray(result[0]) ? result[0] : result
      
      return dataArray.map((row: any) => row.TABLE_NAME as string).filter(name => name && name !== '')
    } catch (error) {
      console.error('Erreur lors de la récupération des tables MySQL:', error)
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
