import ICAL from 'ical.js'

import {
  createCalDAVAccount,
  createCardDAVAccount,
  findCalendars,
  findEvents,
  findUserByEmail,
} from './dav'

import type { DAV_CONFIG } from './dav'

export interface NewsletterEvent {
  calendar: string
  color: string
  id: string
  occurrence?: number
  startDate: Date
  endDate: Date
  allDay: boolean
  title: string
  description?: string
  location?: string
  detailUrl: string
}

interface Range {
  from: Date
  to: Date
}

/**
 * The newsletter is sent every Sunday at 18:00 and covers the **following**
 * week. We use a Sun→Sun window (7 days) starting at the moment of sending.
 * Pass an explicit `now` for tests.
 */
export function nextWeekRange(now: Date = new Date()): Range {
  const from = new Date(now.getTime())
  const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  return { from, to }
}

/**
 * Build the absolute URL where the app renders a single event's detail
 * view. Mirrors the in-app route in `src/pages/index.vue`.
 */
function buildDetailUrl(clientUri: string, when: Date, id: string, occurrence?: number): string {
  const base = clientUri.replace(/\/+$/, '')
  const year = when.getFullYear()
  const month = String(when.getMonth() + 1).padStart(2, '0')
  return occurrence !== undefined
    ? `${base}/${year}/${month}/event/${id}/${occurrence}`
    : `${base}/${year}/${month}/event/${id}`
}

function hrefToId(href: string): string {
  const last = href.lastIndexOf('/')
  return href.slice(last + 1, -4)
}

/**
 * Collect events visible to a specific user across all calendars, expanded
 * for recurrences, within `range`. Mirrors the privacy filter from
 * server/api/calendar.post.ts — events with `CLASS:PRIVATE` are dropped
 * unless the user's VCard CATEGORIES contain the calendar name.
 */
export async function collectEventsForUser(
  davConfig: DAV_CONFIG,
  clientUri: string,
  userEmail: string,
  range: Range,
): Promise<NewsletterEvent[]> {
  const calDavAccount = createCalDAVAccount(davConfig)
  const cardDavAccount = createCardDAVAccount(davConfig)
  const calendars = await findCalendars(calDavAccount)
  const userQuery = await findUserByEmail(cardDavAccount, userEmail)
  const userCategories = userQuery
    ? ((userQuery.vcard.getFirstProperty('categories')?.getValues() as string[] | undefined) ?? [])
    : []

  const results: NewsletterEvent[] = []

  for (const cal of calendars) {
    const calName = cal.displayName as string | undefined
    if (!calName) continue
    const showPrivate = userCategories.includes(calName)
    const color = typeof cal.calendarColor === 'string' ? cal.calendarColor : '#e7e7ff'

    const caldata = await findEvents(calDavAccount, cal.url, range.from, range.to)

    for (const data of caldata) {
      const vcalendar = new ICAL.Component(ICAL.parse(data.props?.calendarData))
      for (const vtimezone of vcalendar.getAllSubcomponents('vtimezone')) {
        ICAL.TimezoneService.register(new ICAL.Timezone(vtimezone))
      }
      const vevent = vcalendar.getFirstSubcomponent('vevent')
      if (!vevent) continue
      if (!showPrivate && vevent.getFirstProperty('class')?.getFirstValue() === 'PRIVATE') {
        continue
      }
      const calEvent = new ICAL.Event(vevent)
      const id = hrefToId(data.href as string)
      const description = (vevent.getFirstProperty('description')?.getFirstValue() ?? undefined) as
        | string
        | undefined
      const location = (vevent.getFirstProperty('location')?.getFirstValue() ?? undefined) as
        | string
        | undefined
      const isAllDay = calEvent.startDate.isDate

      if (calEvent.isRecurring()) {
        const expand = new ICAL.RecurExpansion({
          component: vevent,
          dtstart: vevent.getFirstPropertyValue('dtstart') as ICAL.Time,
        })
        let count = 0
        let next
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ical.js types missing null return
        while ((next = expand.next())) {
          const start = next.toJSDate()
          count += 1
          if (start > range.to) break
          if (start < range.from) continue
          const end = new Date(start.getTime() + calEvent.duration.toSeconds() * 1000)
          results.push({
            calendar: calName,
            color,
            id,
            occurrence: count,
            startDate: start,
            endDate: end,
            allDay: isAllDay,
            title: calEvent.summary,
            description,
            location,
            detailUrl: buildDetailUrl(clientUri, start, id, count),
          })
        }
      } else {
        const start = calEvent.startDate.toJSDate()
        if (start < range.from || start > range.to) continue
        const end = calEvent.endDate.toJSDate()
        results.push({
          calendar: calName,
          color,
          id,
          startDate: start,
          endDate: end,
          allDay: isAllDay,
          title: calEvent.summary,
          description,
          location,
          detailUrl: buildDetailUrl(clientUri, start, id),
        })
      }
    }
  }

  results.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
  return results
}

/**
 * Group events by ISO date string (yyyy-mm-dd, local time) so the email
 * template can render one section per day. Days with no events are
 * omitted — keeps the mail compact.
 */
export function groupEventsByDay(
  events: NewsletterEvent[],
): { date: Date; events: NewsletterEvent[] }[] {
  const buckets = new Map<string, { date: Date; events: NewsletterEvent[] }>()
  for (const ev of events) {
    const d = ev.startDate
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), events: [] }
      buckets.set(key, bucket)
    }
    bucket.events.push(ev)
  }
  return [...buckets.values()].sort((a, b) => a.date.getTime() - b.date.getTime())
}

const WEEKDAY_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const MONTH_DE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
]

export function formatDayHeadingDE(d: Date): string {
  return `${WEEKDAY_DE[d.getDay()]}, ${d.getDate()}. ${MONTH_DE[d.getMonth()]}`
}

export function formatTimeDE(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * ISO-8601 week number. Weeks start on Monday; week 1 is the one that
 * contains the year's first Thursday.
 */
export function isoWeekNumber(d: Date): number {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  // Shift to Thursday of the same ISO week so the year boundary is unambiguous.
  const dayNr = (target.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNr + 3)
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const firstThursdayDayNr = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNr + 3)
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000))
}
