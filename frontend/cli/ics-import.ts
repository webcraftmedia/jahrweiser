import type { DAVAccount } from 'tsdav'
import { createCalendarObject, fetchCalendarObjects, fetchCalendars } from 'tsdav'
import ICAL from 'ical.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type AccountConfig = {
  serverUrl: string
  username: string
  password: string
}

const createCalDAVAccount = (config: AccountConfig): DAVAccount => ({
  accountType: 'caldav',
  serverUrl: config.serverUrl,
  credentials: { username: config.username, password: config.password },
  rootUrl: config.serverUrl + '/dav.php/',
  homeUrl: config.serverUrl + `/dav.php/calendars/${config.username}/`,
})

const icsUrl = process.argv[2]
const accountFile = process.argv[3]
const calendarName = process.argv[4]

if (!icsUrl || !accountFile || !calendarName) {
  console.error('Usage: npx tsx cli/ics-import.ts <ics-url> <account.json> <calendar-name>')
  console.error('')
  console.error('Arguments:')
  console.error('  ics-url       URL to the ICS file to import')
  console.error('  account.json  Path to JSON file in accounts/ folder')
  console.error('  calendar-name Name of the target calendar')
  console.error('')
  console.error('Example:')
  console.error(
    '  npx tsx cli/ics-import.ts https://example.com/cal.ics accounts/myaccount.json "My Calendar"',
  )
  console.error('')
  console.error('See accounts/example.json for the account file format.')
  process.exit(1)
}

// Load account config from JSON file
const accountPath = resolve(process.cwd(), accountFile)
let account: DAVAccount
try {
  const accountJson = readFileSync(accountPath, 'utf-8')
  const config = JSON.parse(accountJson) as AccountConfig
  if (!config.serverUrl || !config.username || !config.password) {
    throw new Error('Missing required fields: serverUrl, username, password')
  }
  account = createCalDAVAccount(config)
} catch (error) {
  console.error(`Failed to read account file: ${accountPath}`)
  console.error(error)
  process.exit(1)
}

const headers = () => {
  const username = account.credentials?.username ?? ''
  const password = account.credentials?.password ?? ''
  return {
    authorization: 'Basic ' + btoa(unescape(encodeURIComponent(username + ':' + password))),
  }
}

// Fetch ICS file
console.log(`Fetching ICS from: ${icsUrl}`)
const icsResponse = await fetch(icsUrl)
if (!icsResponse.ok) {
  console.error(`Failed to fetch ICS: ${icsResponse.status} ${icsResponse.statusText}`)
  process.exit(1)
}
const icsData = await icsResponse.text()

// Parse ICS
const jcalData = ICAL.parse(icsData)
const vcalendar = new ICAL.Component(jcalData)
const vevents = vcalendar.getAllSubcomponents('vevent')

console.log(`Found ${vevents.length} events in ICS file`)

if (vevents.length === 0) {
  console.log('No events to import')
  process.exit(0)
}

// Find target calendar
console.log(`Looking for calendar: ${calendarName}`)
const calendars = await fetchCalendars({
  account,
  headers: headers(),
})

const targetCalendar = calendars.find((cal) => cal.displayName === calendarName)
if (!targetCalendar) {
  console.error(`Calendar not found: ${calendarName}`)
  console.error('Available calendars:')
  calendars.forEach((cal) => console.error(`  - ${cal.displayName}`))
  process.exit(1)
}

console.log(`Target calendar URL: ${targetCalendar.url}`)

// Fetch existing events to check for duplicates
console.log('Fetching existing events...')
const existingEvents = await fetchCalendarObjects({
  calendar: targetCalendar,
  headers: headers(),
})

// Extract UIDs from existing events
const existingUids = new Set<string>()
for (const event of existingEvents) {
  if (event.data) {
    try {
      const existingCal = new ICAL.Component(ICAL.parse(event.data))
      const existingEvent = existingCal.getFirstSubcomponent('vevent')
      if (existingEvent) {
        const uid = existingEvent.getFirstPropertyValue('uid')
        if (uid) {
          existingUids.add(uid.toString())
        }
      }
    } catch {
      // Skip malformed events
    }
  }
}

console.log(`Found ${existingUids.size} existing events in calendar`)

// Import new events
let imported = 0
let skipped = 0

for (const vevent of vevents) {
  const uid = vevent.getFirstPropertyValue('uid')
  if (!uid) {
    console.warn('Skipping event without UID')
    skipped++
    continue
  }

  const uidStr = uid.toString()
  if (existingUids.has(uidStr)) {
    skipped++
    continue
  }

  // Create a new VCALENDAR with just this event
  const newCalendar = new ICAL.Component('vcalendar')
  newCalendar.addPropertyWithValue('version', '2.0')
  newCalendar.addPropertyWithValue('prodid', '-//Jahrweiser//Import//DE')
  newCalendar.addSubcomponent(vevent)

  const summary = vevent.getFirstPropertyValue('summary') || 'Untitled'
  console.log(`Importing: ${summary}`)

  try {
    await createCalendarObject({
      calendar: targetCalendar,
      filename: `${uidStr}.ics`,
      iCalString: newCalendar.toString(),
      headers: headers(),
    })
    imported++
    existingUids.add(uidStr) // Prevent duplicates within same import
  } catch (error) {
    console.error(`Failed to import event ${summary}:`, error)
  }
}

console.log('')
console.log(`Import complete: ${imported} imported, ${skipped} skipped (duplicates or invalid)`)
