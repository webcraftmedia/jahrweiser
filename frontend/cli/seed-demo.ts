import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

import ICAL from 'ical.js'

import { createCardDAVAccount, createUser, X_ADMIN_TAGS, X_ROLE } from '../server/helpers/dav'
import { syncDavToSidecar } from '../server/helpers/sync'

import { config } from './tools/config'
import { assertLocalEnv } from './tools/production-guard'

assertLocalEnv({ davUrl: config.DAV_URL, dbHost: config.DB_HOST })

// Make sure Baikal has a DAV principal + addressbook before we try to PUT VCards.
// This is a no-op if already provisioned.
console.warn('[seed-demo] ensuring Baikal DAV user is provisioned')
execSync('npm run --silent cli:baikal:bootstrap', { stdio: 'inherit' })

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

// ---------------------------------------------------------------------------
// Extra calendars — beyond the default 'Vereinskalender' that the Baikal
// bootstrap creates. Idempotent via MKCALENDAR; Baikal answers 201 on create
// and 405 if the URI already exists.
// ---------------------------------------------------------------------------

interface SeedCalendar {
  uri: string
  displayName: string
  color: string
}

const extraCalendars: SeedCalendar[] = [
  { uri: 'theater-ag', displayName: 'Theater AG', color: '#a855f7' },
  { uri: 'sportgruppe', displayName: 'Sportgruppe', color: '#22c55e' },
  { uri: 'familie', displayName: 'Familie', color: '#f59e0b' },
]

const calendarsBase = `${config.DAV_URL.replace(/\/+$/, '')}/dav.php/calendars/admin`
const davAuth = `Basic ${Buffer.from(`${config.DAV_USERNAME}:${config.DAV_PASSWORD}`).toString('base64')}`

async function ensureCalendar(cal: SeedCalendar): Promise<void> {
  const url = `${calendarsBase}/${cal.uri}/`
  const body =
    '<?xml version="1.0" encoding="utf-8" ?>' +
    '<C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:I="http://apple.com/ns/ical/">' +
    '  <D:set>' +
    '    <D:prop>' +
    `      <D:displayname>${cal.displayName}</D:displayname>` +
    `      <I:calendar-color>${cal.color}</I:calendar-color>` +
    '      <C:supported-calendar-component-set>' +
    '        <C:comp name="VEVENT"/>' +
    '      </C:supported-calendar-component-set>' +
    '    </D:prop>' +
    '  </D:set>' +
    '</C:mkcalendar>'
  const res = await fetch(url, {
    method: 'MKCALENDAR',
    headers: { Authorization: davAuth, 'Content-Type': 'application/xml; charset=utf-8' },
    body,
  })
  if (res.status === 201) {
    console.warn(`  + calendar ${cal.displayName} (${cal.uri})`)
  } else if (res.status === 405) {
    console.warn(`  = calendar ${cal.displayName} (${cal.uri}) already exists`)
  } else {
    throw new Error(`MKCALENDAR ${url} failed: HTTP ${res.status} ${res.statusText}`)
  }
}

console.warn(`[seed-demo] Ensuring ${extraCalendars.length} extra calendar(s) in DAV.`)
for (const cal of extraCalendars) {
  await ensureCalendar(cal)
}

// ---------------------------------------------------------------------------
// Calendar events — PUT iCalendar files into Baikal's default calendar so the
// app's calendar UI has something to render right after `npm run cli:seed:demo`.
// ---------------------------------------------------------------------------

interface SeedEvent {
  uid: string
  summary: string
  description?: string
  location?: string
  /** offset in days from "today" (negative = past) */
  startOffsetDays: number
  /** start hour in UTC; defaults to 18 if omitted. Ignored if allDay=true */
  startHourUTC?: number
  /** start minute in UTC; defaults to 0. Ignored if allDay=true */
  startMinuteUTC?: number
  /** total duration in hours; ignored if allDay=true */
  durationHours?: number
  allDay?: boolean
  /** Calendar URI (e.g. 'default', 'theater-ag'). Defaults to 'default'. */
  calendar?: string
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function formatIcsDate(d: Date, allDay: boolean): string {
  if (allDay) {
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
  }
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

function buildIcs(event: SeedEvent): string {
  const base = new Date()
  base.setUTCHours(event.startHourUTC ?? 18, event.startMinuteUTC ?? 0, 0, 0)
  const start = new Date(base)
  start.setUTCDate(base.getUTCDate() + event.startOffsetDays)
  const end = new Date(start)
  if (event.allDay) {
    end.setUTCDate(start.getUTCDate() + 1)
  } else {
    end.setUTCHours(start.getUTCHours() + (event.durationHours ?? 2))
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Jahrweiser//seed-demo//EN',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${formatIcsDate(new Date(), false)}`,
    event.allDay
      ? `DTSTART;VALUE=DATE:${formatIcsDate(start, true)}`
      : `DTSTART:${formatIcsDate(start, false)}`,
    event.allDay
      ? `DTEND;VALUE=DATE:${formatIcsDate(end, true)}`
      : `DTEND:${formatIcsDate(end, false)}`,
    `SUMMARY:${event.summary}`,
  ]
  if (event.description) lines.push(`DESCRIPTION:${event.description}`)
  if (event.location) lines.push(`LOCATION:${event.location}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

const seedEvents: SeedEvent[] = [
  {
    uid: 'seed-event-yesterday',
    summary: 'Vorstandssitzung',
    description: 'Monatliche Sitzung des Vorstands',
    location: 'Vereinsheim',
    startOffsetDays: -1,
    durationHours: 2,
    calendar: 'default',
  },
  // Today — three events on three different calendars
  {
    uid: 'seed-event-today-morning',
    summary: 'Yoga im Park',
    location: 'Stadtpark Wiese 3',
    startOffsetDays: 0,
    startHourUTC: 7,
    durationHours: 1,
    calendar: 'sportgruppe',
  },
  {
    uid: 'seed-event-today',
    summary: 'Probe Theater AG',
    location: 'Saal',
    startOffsetDays: 0,
    startHourUTC: 16,
    durationHours: 3,
    calendar: 'theater-ag',
  },
  {
    uid: 'seed-event-today-evening',
    summary: 'Chorprobe',
    location: 'Kirche St. Marien',
    startOffsetDays: 0,
    startHourUTC: 19,
    startMinuteUTC: 30,
    durationHours: 2,
    calendar: 'default',
  },
  // Tomorrow — events from different calendars on the same day
  {
    uid: 'seed-event-tomorrow-morning',
    summary: 'Frühschoppen der Blaskapelle',
    location: 'Marktplatz',
    startOffsetDays: 1,
    startHourUTC: 9,
    durationHours: 2,
    calendar: 'default',
  },
  {
    uid: 'seed-event-tomorrow-family',
    summary: 'Kinderflohmarkt',
    location: 'Pfarrgarten',
    startOffsetDays: 1,
    startHourUTC: 14,
    durationHours: 3,
    calendar: 'familie',
  },
  {
    uid: 'seed-event-tomorrow',
    summary: 'Stammtisch',
    location: 'Gasthof zur Linde',
    startOffsetDays: 1,
    startHourUTC: 18,
    durationHours: 3,
    calendar: 'default',
  },
  // +2 days — sport
  {
    uid: 'seed-event-plus2-sport',
    summary: 'Lauftreff',
    location: 'Treffpunkt Sportplatz',
    startOffsetDays: 2,
    startHourUTC: 17,
    durationHours: 1,
    calendar: 'sportgruppe',
  },
  // +3 days — two events on different calendars
  {
    uid: 'seed-event-plus3-allday',
    summary: 'Vereinsausflug',
    description: 'Busfahrt ins Umland mit Mittagessen',
    location: 'Abfahrt: Vereinsheim',
    startOffsetDays: 3,
    allDay: true,
    calendar: 'default',
  },
  {
    uid: 'seed-event-plus3-evening',
    summary: 'Premiere "Drei Schwestern"',
    description: 'Theaterstück mit anschließender Diskussion',
    location: 'Bürgersaal',
    startOffsetDays: 3,
    startHourUTC: 19,
    durationHours: 2,
    calendar: 'theater-ag',
  },
  // +5 days — family
  {
    uid: 'seed-event-plus5-family',
    summary: 'Familienwanderung',
    description: 'Kinderfreundliche Strecke zum Spielplatz',
    location: 'Waldparkplatz',
    startOffsetDays: 5,
    startHourUTC: 10,
    durationHours: 3,
    calendar: 'familie',
  },
  {
    uid: 'seed-event-next-week',
    summary: 'Kulturwanderung',
    description: 'Geführte Wanderung durch das alte Industriegebiet',
    location: 'Treffpunkt Marktplatz',
    startOffsetDays: 7,
    allDay: true,
    calendar: 'default',
  },
  {
    uid: 'seed-event-next-month',
    summary: 'Jahresversammlung',
    description: 'Jahreshauptversammlung mit Wahl des Vorstands',
    location: 'Vereinsheim',
    startOffsetDays: 35,
    durationHours: 4,
    calendar: 'default',
  },
]

console.warn(`[seed-demo] Creating ${seedEvents.length} calendar event(s) in DAV.`)
for (const event of seedEvents) {
  const calendarUri = event.calendar ?? 'default'
  const url = `${calendarsBase}/${calendarUri}/${event.uid}.ics`
  const body = buildIcs(event)
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: davAuth, 'Content-Type': 'text/calendar; charset=utf-8' },
    body,
  })
  if (!res.ok) {
    throw new Error(`Failed to PUT ${url}: HTTP ${res.status} ${res.statusText}`)
  }
  console.warn(`  + [${calendarUri}] ${event.summary}`)
}

process.exit(0)
