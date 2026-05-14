import { randomUUID } from 'node:crypto'

import ICAL from 'ical.js'

import { createCardDAVAccount, createUser, X_ADMIN_TAGS, X_ROLE } from '../server/helpers/dav'
import { syncDavToSidecar } from '../server/helpers/sync'

import { config } from './tools/config'
import { assertLocalEnv } from './tools/production-guard'

assertLocalEnv({ davUrl: config.DAV_URL, dbHost: config.DB_HOST })

interface SeedUser {
  fullname: string
  email: string
  role: 'user' | 'admin'
  tags: string[]
}

const seedUsers: SeedUser[] = [
  { fullname: 'Alice Example', email: 'alice@example.com', role: 'user', tags: [] },
  { fullname: 'Bob Example', email: 'bob@example.com', role: 'user', tags: ['veranstalter'] },
  {
    fullname: 'Admin Example',
    email: 'admin@example.com',
    role: 'admin',
    tags: ['veranstalter', 'team'],
  },
  { fullname: 'Carol Example', email: 'carol@example.com', role: 'user', tags: ['team'] },
]

function buildVCard(user: SeedUser): ICAL.Component {
  const vcard = new ICAL.Component(['vcard', [], []])
  vcard.updatePropertyWithValue('version', '4.0')
  vcard.updatePropertyWithValue('uid', randomUUID())
  vcard.updatePropertyWithValue('fn', user.fullname)
  vcard.updatePropertyWithValue('email', user.email)
  vcard.updatePropertyWithValue(X_ROLE, user.role)
  if (user.tags.length > 0) {
    vcard.updatePropertyWithValue(X_ADMIN_TAGS, user.tags.join(','))
  }
  return vcard
}

const davConfig = {
  DAV_USERNAME: config.DAV_USERNAME,
  DAV_PASSWORD: config.DAV_PASSWORD,
  DAV_URL: config.DAV_URL,
  DAV_URL_CARD: config.DAV_URL_CARD,
}

const account = createCardDAVAccount(davConfig)

console.warn(`[seed-demo] Creating ${seedUsers.length} test user(s) in DAV.`)
for (const user of seedUsers) {
  const vcard = buildVCard(user)
  await createUser(account, vcard)
  console.warn(`  + ${user.email} (${user.role})`)
}

console.warn('[seed-demo] Running sync to populate MariaDB sidecar.')
const result = await syncDavToSidecar(davConfig)
console.warn(
  `[seed-demo] Sync result: +${result.added} added, ~${result.updated} updated, -${result.deleted} deleted.`,
)

process.exit(0)
