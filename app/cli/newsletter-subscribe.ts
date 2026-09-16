import { randomBytes } from 'node:crypto'

import { eq } from 'drizzle-orm'

import { useDb } from '../server/db'
import { users } from '../server/db/schema'

import { config } from './tools/config'
import { check as checkEmail } from './tools/email'
import { assertLocalEnv } from './tools/production-guard'

const email = process.argv[2]

checkEmail(email)
assertLocalEnv({ davUrl: config.DAV_URL, dbHost: config.DB_HOST })

const normalizedEmail = email.toLowerCase()
const db = useDb()

const row = (await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1))[0]
if (!row) {
  console.error(`User with email ${normalizedEmail} not found in sidecar.`)
  process.exit(1)
}

const ensuredToken = row.unsubscribeToken ?? randomBytes(32).toString('hex')

await db
  .update(users)
  .set({ newsletterSubscribed: 'subscribed', unsubscribeToken: ensuredToken })
  .where(eq(users.uid, row.uid))

console.warn(`Subscribed ${normalizedEmail} to the weekly newsletter.`)
process.exit(0)
