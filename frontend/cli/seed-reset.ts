import { randomUUID } from 'node:crypto'

import { deleteVCard, fetchAddressBooks, fetchVCards } from 'tsdav'

import { useDb } from '../server/db'
import { loginTokens, sessions, syncState, userTags, users } from '../server/db/schema'
import { createCardDAVAccount, headers } from '../server/helpers/dav'

import { config } from './tools/config'
import { assertLocalEnv } from './tools/production-guard'

// This CLI deletes every VCard and every calendar event in the addressbook
// + truncates the sidecar — single-layer prod-guard isn't enough.
assertLocalEnv({
  davUrl: config.DAV_URL,
  dbHost: config.DB_HOST,
  extraConfirmEnvVar: 'I_REALLY_WANT_TO_WIPE_PRODUCTION_DAV',
})

const account = createCardDAVAccount({
  DAV_USERNAME: config.DAV_USERNAME,
  DAV_PASSWORD: config.DAV_PASSWORD,
  DAV_URL: config.DAV_URL,
  DAV_URL_CARD: config.DAV_URL_CARD,
})
const fetchHeaders = headers(account)

console.warn(
  `[seed-reset] wiping DAV addressbook + MariaDB sidecar (correlationId=${randomUUID()})`,
)

const addressbooks = await fetchAddressBooks({ account, headers: fetchHeaders })
let davDeleted = 0
for (const ab of addressbooks) {
  const vcards = await fetchVCards({ addressBook: ab, headers: fetchHeaders })
  for (const vc of vcards) {
    await deleteVCard({
      vCard: { url: vc.url, etag: vc.etag },
      headers: fetchHeaders,
    })
    davDeleted += 1
  }
}
console.warn(`[seed-reset] DAV: deleted ${davDeleted} VCard(s).`)

// Wipe calendar events too. We list them via PROPFIND on the default
// calendar URL and DELETE each .ics resource individually.
const calendarUrl = `${config.DAV_URL.replace(/\/+$/, '')}/dav.php/calendars/admin/default/`
const propfind = await fetch(calendarUrl, {
  method: 'PROPFIND',
  headers: { ...fetchHeaders, Depth: '1' },
})
let icsDeleted = 0
if (propfind.ok || propfind.status === 207) {
  const xml = await propfind.text()
  const hrefs = [...xml.matchAll(/<d:href>([^<]+\.ics)<\/d:href>/g)].map((m) => m[1]!)
  for (const href of hrefs) {
    const url = href.startsWith('http') ? href : `${config.DAV_URL.replace(/\/+$/, '')}${href}`
    const del = await fetch(url, { method: 'DELETE', headers: fetchHeaders })
    if (del.status === 204 || del.status === 200 || del.status === 404) {
      icsDeleted += 1
    }
  }
}
console.warn(`[seed-reset] DAV: deleted ${icsDeleted} calendar event(s).`)

const db = useDb()
// FK CASCADE handles dependents, but explicit order makes intent clear
await db.delete(sessions)
await db.delete(loginTokens)
await db.delete(userTags)
await db.delete(users)
await db.delete(syncState)
console.warn(
  '[seed-reset] MariaDB: truncated sessions, login_tokens, user_tags, users, sync_state.',
)

process.exit(0)
