import { eq } from 'drizzle-orm'

import { useDb } from '../server/db'
import { users } from '../server/db/schema'
import { createCardDAVAccount, findUserByEmail } from '../server/helpers/dav'
import { extractUserFromVCardData } from '../server/helpers/sync'

import { config } from './tools/config'
import { check as checkEmail } from './tools/email'
import { assertLocalEnv } from './tools/production-guard'

const email = process.argv[2]

checkEmail(email)
assertLocalEnv({ davUrl: config.DAV_URL, dbHost: config.DB_HOST })

const normalizedEmail = email.toLowerCase()
const db = useDb()

let row = (await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1))[0]

if (!row) {
  // Lazy fallback: user is in DAV but not yet in sidecar
  const davAccount = createCardDAVAccount(config)
  const match = await findUserByEmail(davAccount, normalizedEmail)
  if (!match) {
    console.error(`User with email ${normalizedEmail} not found in DAV or sidecar.`)
    process.exit(1)
  }
  const snap = extractUserFromVCardData(match.vcard.toString())
  if (!snap) {
    console.error('Could not parse VCard for that user.')
    process.exit(1)
  }
  await db.insert(users).values({
    uid: snap.uid,
    email: snap.email,
    displayName: snap.displayName,
    role: 'admin',
  })
  row = (await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1))[0]
}

if (!row) {
  console.error('Failed to materialize user in sidecar.')
  process.exit(1)
}

await db.update(users).set({ role: 'admin' }).where(eq(users.uid, row.uid))
console.warn(`Granted admin role to ${normalizedEmail}.`)
process.exit(0)
