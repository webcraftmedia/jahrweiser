import ICAL from 'ical.js'

import {
  calendarKey,
  calendarLabel,
  createCalDAVAccount,
  createCardDAVAccount,
  findCalendars,
  findAllUsers,
  readAdminTags,
  readCategories,
  saveVCardAt,
  X_ADMIN_TAGS,
} from '../server/helpers/dav'

import { config } from './tools/config'
import { assertLocalEnv } from './tools/production-guard'

/**
 * One-way migration: rewrites calendar access grants from display names to the
 * stable calendar key (the collection URL segment, see `calendarKey`).
 *
 * Both `CATEGORIES` (a user's private-calendar access) and `X-ADMIN-TAGS` (what
 * an admin may hand out) used to hold `DAV:displayname` values. That is a
 * mutable label: renaming a calendar in any CalDAV client silently revoked every
 * grant, because the access check only ever denies and never errors.
 *
 * MUST run BEFORE deploying the code that joins on the key — the switch is a
 * hard cutover, so between deploy and migration nobody would see private events.
 *
 * Values that match no current calendar are dropped (they cannot be mapped and
 * would never match again). Dry-run by default; pass `--apply` to write.
 */
assertLocalEnv({
  davUrl: config.DAV_URL,
  dbHost: config.DB_HOST,
  extraConfirmEnvVar: 'I_HAVE_BACKED_UP_DAV',
})

const apply = process.argv.includes('--apply')

const calDavAccount = createCalDAVAccount(config)
const cardDavAccount = createCardDAVAccount(config)

const calendars = await findCalendars(calDavAccount)
// Display name -> key. A duplicate display name is ambiguous, so it is reported
// rather than silently resolved to whichever calendar came last.
const byDisplayName = new Map<string, string[]>()
const keys = new Set<string>()
for (const cal of calendars) {
  const key = calendarKey(cal)
  keys.add(key)
  const name = calendarLabel(cal)
  if (name === key) continue
  byDisplayName.set(name, [...(byDisplayName.get(name) ?? []), key])
}

console.warn(`[migrate-calendar-tags] ${calendars.length} calendar(s) on the server:`)
for (const cal of calendars) {
  console.warn(`  ${calendarKey(cal)}  <-  "${calendarLabel(cal)}"`)
}
console.warn(apply ? '\nMode: APPLY (writing)\n' : '\nMode: DRY-RUN (nothing is written)\n')

interface Resolution {
  kept: string[]
  dropped: string[]
  ambiguous: string[]
}

/** Map one grant list from display names to keys, dropping what cannot map. */
function resolve(values: string[]): Resolution {
  const kept: string[] = []
  const dropped: string[] = []
  const ambiguous: string[] = []
  for (const value of values) {
    // Already migrated (or seeded as a key) — idempotent, keep as is.
    if (keys.has(value)) {
      if (!kept.includes(value)) kept.push(value)
      continue
    }
    const matches = byDisplayName.get(value) ?? []
    if (matches.length === 1) {
      if (!kept.includes(matches[0]!)) kept.push(matches[0]!)
    } else if (matches.length > 1) {
      ambiguous.push(value)
    } else {
      dropped.push(value)
    }
  }
  return { kept, dropped, ambiguous }
}

/**
 * CATEGORIES is a real multi-value property; X-ADMIN-TAGS is not — ical.js
 * rejects setValues() on it, which is exactly why readAdminTags() splits the
 * single value on commas itself. Write each in its own encoding.
 */
function setCategories(vcard: ICAL.Component, values: string[]): void {
  vcard.removeAllProperties('categories')
  if (values.length === 0) return
  vcard.addPropertyWithValue('categories', '')
  vcard.getFirstProperty('categories')!.setValues(values)
}

function setAdminTags(vcard: ICAL.Component, values: string[]): void {
  vcard.removeAllProperties(X_ADMIN_TAGS)
  if (values.length === 0) return
  vcard.updatePropertyWithValue(X_ADMIN_TAGS, values.join(','))
}

const cards = await findAllUsers(cardDavAccount)
console.warn(`[migrate-calendar-tags] ${cards.length} contact(s) to inspect.\n`)

let changed = 0
const droppedTotal: string[] = []
const ambiguousTotal: string[] = []

for (const card of cards) {
  if (!card.data) continue
  let vcard: ICAL.Component
  try {
    vcard = new ICAL.Component(ICAL.parse(card.data))
    // eslint-disable-next-line no-catch-all/no-catch-all -- eine unparsebare VCard darf die Migration aller anderen nicht stoppen
  } catch {
    console.warn(`  ! ${card.url} — unparseable vCard, skipped`)
    continue
  }

  const email = vcard.getFirstPropertyValue('email')?.toString() ?? card.url
  const categories = readCategories(vcard)
  const adminTags = readAdminTags(vcard)
  if (categories.length === 0 && adminTags.length === 0) continue

  const cat = resolve(categories)
  const adm = resolve(adminTags)

  const catChanged = cat.kept.join(',') !== categories.join(',')
  const admChanged = adm.kept.join(',') !== adminTags.join(',')
  if (!catChanged && !admChanged) continue

  console.warn(`  ${email}`)
  if (catChanged)
    console.warn(
      `    CATEGORIES   ${categories.join(', ')}  ->  ${cat.kept.join(', ') || '(none)'}`,
    )
  if (admChanged)
    console.warn(`    X-ADMIN-TAGS ${adminTags.join(', ')}  ->  ${adm.kept.join(', ') || '(none)'}`)
  for (const d of [...cat.dropped, ...adm.dropped]) {
    console.warn(`    - dropped "${d}" (matches no calendar)`)
    droppedTotal.push(`${email}: ${d}`)
  }
  for (const a of [...cat.ambiguous, ...adm.ambiguous]) {
    console.warn(`    ! kept "${a}" — several calendars share this display name, resolve manually`)
    ambiguousTotal.push(`${email}: ${a}`)
  }

  if (apply) {
    setCategories(vcard, cat.kept)
    setAdminTags(vcard, adm.kept)
    await saveVCardAt(cardDavAccount, { url: card.url, etag: card.etag }, vcard)
  }
  changed += 1
}

console.warn(
  `\n[migrate-calendar-tags] ${changed} contact(s) ${apply ? 'updated' : 'would change'}.`,
)
if (droppedTotal.length > 0) {
  console.warn(`[migrate-calendar-tags] ${droppedTotal.length} grant(s) dropped:`)
  for (const d of droppedTotal) console.warn(`  - ${d}`)
}
if (ambiguousTotal.length > 0) {
  console.warn(
    `[migrate-calendar-tags] ${ambiguousTotal.length} ambiguous value(s) left untouched — ` +
      'give those calendars distinct display names and re-run:',
  )
  for (const a of ambiguousTotal) console.warn(`  ! ${a}`)
}
if (!apply) {
  console.warn('\nNothing was written. Re-run with --apply to perform the migration.')
}
