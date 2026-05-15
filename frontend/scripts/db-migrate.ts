import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/mysql2'
import { migrate } from 'drizzle-orm/mysql2/migrator'
import mysql from 'mysql2/promise'

config()

// DB_SOCKET takes priority — needed when MariaDB only listens on a unix socket
// (Alpine default) and the app user is GRANTed for '@localhost' only.
const connection = await mysql.createConnection(
  process.env.DB_SOCKET
    ? {
        socketPath: process.env.DB_SOCKET,
        user: process.env.DB_USER || 'jahrweiser',
        password: process.env.DB_PASSWORD || 'jahrweiser',
        database: process.env.DB_NAME || 'jahrweiser',
        multipleStatements: true,
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
        user: process.env.DB_USER || 'jahrweiser',
        password: process.env.DB_PASSWORD || 'jahrweiser',
        database: process.env.DB_NAME || 'jahrweiser',
        multipleStatements: true,
      },
)

const db = drizzle(connection)

await migrate(db, { migrationsFolder: './server/db/migrations' })

await connection.end()
console.warn('Migrations applied.')
