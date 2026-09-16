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

// Wipe calendar events too. We enumerate calendars under the admin principal
// via PROPFIND depth=1, then PROPFIND each calendar for its .ics resources
// and DELETE them individually. This way the reset works regardless of how
// many demo calendars the seed has provisioned.
const davRoot = config.DAV_URL.replace(/\/+$/, '')
const calendarsBase = `${davRoot}/dav.php/calendars/admin/`
const calendarList = await fetch(calendarsBase, {
  method: 'PROPFIND',
  headers: { ...fetchHeaders, Depth: '1' },
})
let icsDeleted = 0
if (calendarList.ok || calendarList.status === 207) {
  const listXml = await calendarList.text()
  // Each calendar appears as a <d:href> ending in / (its own collection URI).
  const calendarHrefs = [...listXml.matchAll(/<d:href>([^<]+)<\/d:href>/g)]
    .map((m) => m[1]!)
    .filter((href) => href.endsWith('/') && href !== '/dav.php/calendars/admin/')
  for (const calHref of calendarHrefs) {
    const calUrl = calHref.startsWith('http') ? calHref : `${davRoot}${calHref}`
    const inside = await fetch(calUrl, {
      method: 'PROPFIND',
      headers: { ...fetchHeaders, Depth: '1' },
    })
    if (!inside.ok && inside.status !== 207) continue
    const xml = await inside.text()
    const hrefs = [...xml.matchAll(/<d:href>([^<]+\.ics)<\/d:href>/g)].map((m) => m[1]!)
    for (const href of hrefs) {
      const url = href.startsWith('http') ? href : `${davRoot}${href}`
      const del = await fetch(url, { method: 'DELETE', headers: fetchHeaders })
      if (del.status === 204 || del.status === 200 || del.status === 404) {
        icsDeleted += 1
      }
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
