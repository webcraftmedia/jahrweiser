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

export type ImportConfig = {
  url: string
  account: string
  calendar: string
}

export type ImportResult = {
  success: boolean
  imported: number
  skipped: number
  error?: string
}

const createCalDAVAccount = (config: AccountConfig): DAVAccount => ({
  accountType: 'caldav',
  serverUrl: config.serverUrl,
  credentials: { username: config.username, password: config.password },
  rootUrl: config.serverUrl + '/dav.php/',
  homeUrl: config.serverUrl + `/dav.php/calendars/${config.username}/`,
})

const createHeaders = (account: DAVAccount) => {
  const username = account.credentials?.username ?? ''
  const password = account.credentials?.password ?? ''
  return {
    authorization: 'Basic ' + btoa(unescape(encodeURIComponent(username + ':' + password))),
  }
}

export async function runIcsImport(config: ImportConfig): Promise<ImportResult> {
  const { url: icsUrl, account: accountFile, calendar: calendarName } = config

  // Load account config from JSON file
  const accountPath = resolve(process.cwd(), accountFile)
  let account: DAVAccount
  try {
    const accountJson = readFileSync(accountPath, 'utf-8')
    const accountConfig = JSON.parse(accountJson) as AccountConfig
    if (!accountConfig.serverUrl || !accountConfig.username || !accountConfig.password) {
      throw new Error('Missing required fields: serverUrl, username, password')
    }
    account = createCalDAVAccount(accountConfig)
  } catch (error) {
    return {
      success: false,
      imported: 0,
      skipped: 0,
      error: `Failed to read account file: ${accountPath} - ${error}`,
    }
  }

  const headers = () => createHeaders(account)

  // Fetch ICS file
  console.log(`Fetching ICS from: ${icsUrl}`)
  let icsData: string
  try {
    const icsResponse = await fetch(icsUrl)
    if (!icsResponse.ok) {
      return {
        success: false,
        imported: 0,
        skipped: 0,
        error: `Failed to fetch ICS: ${icsResponse.status} ${icsResponse.statusText}`,
      }
    }
    icsData = await icsResponse.text()
  } catch (error) {
    return {
      success: false,
      imported: 0,
      skipped: 0,
      error: `Failed to fetch ICS: ${error}`,
    }
  }

  // Parse ICS
  const jcalData = ICAL.parse(icsData)
  const vcalendar = new ICAL.Component(jcalData)
  const vevents = vcalendar.getAllSubcomponents('vevent')

  console.log(`Found ${vevents.length} events in ICS file`)

  if (vevents.length === 0) {
    return { success: true, imported: 0, skipped: 0 }
  }

  // Find target calendar
  console.log(`Looking for calendar: ${calendarName}`)
  let calendars
  try {
    calendars = await fetchCalendars({
      account,
      headers: headers(),
    })
  } catch (error) {
    return {
      success: false,
      imported: 0,
      skipped: 0,
      error: `Failed to fetch calendars: ${error}`,
    }
  }

  const targetCalendar = calendars.find((cal) => cal.displayName === calendarName)
  if (!targetCalendar) {
    const available = calendars.map((cal) => cal.displayName).join(', ')
    return {
      success: false,
      imported: 0,
      skipped: 0,
      error: `Calendar not found: ${calendarName}. Available: ${available}`,
    }
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

  return { success: true, imported, skipped }
}
