import ICAL from 'ical.js'
import { fetchAddressBooks, fetchVCards } from 'tsdav'

import {
  createCardDAVAccount,
  headers,
  saveUser,
  X_LOGIN_DISABLED,
  X_LOGIN_REQUEST_TIME,
  X_LOGIN_TIME,
  X_LOGIN_TOKEN,
  X_ROLE,
} from '../server/helpers/dav'

import { config } from './tools/config'
import { assertLocalEnv } from './tools/production-guard'

const TARGET_PROPS = [X_LOGIN_TOKEN, X_LOGIN_REQUEST_TIME, X_LOGIN_TIME, X_LOGIN_DISABLED, X_ROLE]

// One-way migration: removes auth-related X-properties from every VCard.
// Stay paranoid even when explicitly running against prod.
assertLocalEnv({
  davUrl: config.DAV_URL,
  dbHost: config.DB_HOST,
  extraConfirmEnvVar: 'I_HAVE_BACKED_UP_DAV',
})

const account = createCardDAVAccount(config)
const fetchHeaders = headers(account)

console.warn('[purge-auth-xprops] Scanning all addressbooks for legacy auth X-properties.')

const addressbooks = await fetchAddressBooks({ account, headers: fetchHeaders })
let scanned = 0
let modified = 0

for (const ab of addressbooks) {
  const vcards = await fetchVCards({ addressBook: ab, headers: fetchHeaders })
  for (const vc of vcards) {
    scanned += 1
    let component: ICAL.Component
    try {
      component = new ICAL.Component(ICAL.parse(vc.data))
    } catch {
      console.warn(`  skipped: failed to parse ${vc.url}`)
      continue
    }
    let touched = false
    for (const prop of TARGET_PROPS) {
      if (component.getFirstProperty(prop)) {
        component.removeAllProperties(prop)
        touched = true
      }
    }
    if (touched) {
      const davResponse = { href: vc.url, props: { getetag: vc.etag } }
      await saveUser(account, davResponse, component)
      modified += 1
    }
  }
}

console.warn(`[purge-auth-xprops] Scanned ${scanned} VCard(s); modified ${modified}.`)
console.warn(
  '[purge-auth-xprops] DONE. Roles are now MariaDB-only. Re-running sync from scratch will reset all roles to "user".',
)
process.exit(0)
