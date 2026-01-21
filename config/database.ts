import Env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/lucid'

const dbConfig = defineConfig({
  connection: Env.get('DB_CONNECTION'),
  connections: {
    sqlite: {
      client: 'better-sqlite3',
      connection: {
        filename: app.tmpPath('db.sqlite3')
      },
      useNullAsDefault: true,
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
    },

    mysql: {
      client: 'mysql2',
      connection: {
        host: Env.get('DB_HOST'),
        port: Env.get('DB_PORT'),
        user: Env.get('DB_USER'),
        password: Env.get('DB_PASSWORD'),
        database: Env.get('DB_DATABASE'),
      },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
    },
  },
})

export default dbConfig