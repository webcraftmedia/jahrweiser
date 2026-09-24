import { existsSync } from 'node:fs'

import { drizzle } from 'drizzle-orm/mysql2'
import { migrate } from 'drizzle-orm/mysql2/migrator'
import { createConnection } from 'mysql2/promise'

/**
 * Read `.env` without dotenv.
 *
 * This script is the one thing in `scripts/` that runs on the server, where the
 * install is production-only — and `dotenv` is a devDependency, so importing it
 * here made `npm run db:migrate` fail with ERR_MODULE_NOT_FOUND on the deploy
 * host while working perfectly in CI, which installs everything. Node has
 * carried `loadEnvFile` since 20.12, and the project runs 24 (`.tool-versions`).
 *
 * The file is optional: a deployment may export the variables itself, and
 * `loadEnvFile` throws rather than shrugging when there is nothing to read.
 */
if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

// DB_SOCKET takes priority — needed when MariaDB only listens on a unix socket
// (Alpine default) and the app user is GRANTed for '@localhost' only.
const connection = await createConnection(
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
