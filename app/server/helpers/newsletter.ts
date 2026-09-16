import { readFileSync } from 'node:fs'
import path from 'node:path'

import { paletteMailColorForIndex } from '../../shared/calendar-palette'

import {
  calendarKey,
  createCalDAVAccount,
  createCardDAVAccount,
  findCalendars,
  findEvents,
  findUserByEmail,
  readCategories,
} from './dav'
import { collectOccurrences, parseCalendarEvent, toComparableDate } from './ical'

import type { DAV_CONFIG } from './dav'
import type ICAL from 'ical.js'

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
 * Optional free-text property of a VEVENT. Read off the component rather than
 * ICAL.Event, whose getters are typed as non-nullable `string` but return null
 * for absent properties.
 */
function optionalText(vevent: ICAL.Component, name: string): string | undefined {
  return (vevent.getFirstProperty(name)?.getFirstValue() ?? undefined) as string | undefined
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
  const userCategories = userQuery ? readCategories(userQuery.vcard) : []

  const results: NewsletterEvent[] = []

  for (const [calIndex, cal] of calendars.entries()) {
    const calName = cal.displayName as string | undefined
    if (!calName) continue
    const showPrivate = userCategories.includes(calendarKey(cal))
    // Color is assigned by the calendar's position in the list. Newsletter
    // uses the higher-contrast `mail` variant; the in-app calendar view uses
    // the muted `light.border` for the same index (see shared/calendar-palette.ts).
    const color = paletteMailColorForIndex(calIndex)

    const caldata = await findEvents(calDavAccount, cal.url, range.from, range.to)

    for (const data of caldata) {
      const parsed = parseCalendarEvent(data.props?.calendarData)
      if (!parsed) continue
      const id = hrefToId(data.href as string)

      // Expansion inkl. RECURRENCE-ID-Overrides liegt in helpers/ical.ts —
      // Titel, Ort und Beschreibung stammen daher pro Termin aus dem Override,
      // sofern einer existiert.
      for (const occ of collectOccurrences(parsed, range, { showPrivate })) {
        const start = toComparableDate(occ.startDate)
        results.push({
          calendar: calName,
          color,
          id,
          occurrence: occ.occurrence,
          startDate: start,
          endDate: toComparableDate(occ.endDate),
          allDay: occ.allDay,
          title: occ.item.summary,
          description: optionalText(occ.item.component, 'description'),
          location: optionalText(occ.item.component, 'location'),
          detailUrl: buildDetailUrl(clientUri, start, id, occ.occurrence),
        })
      }
    }
  }

  results.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
  return results
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

interface ZonedParts {
  year: number
  month: number
  day: number
  weekday: number
  hour: number
  minute: number
}

/**
 * Pull calendar parts of `d` as observed in IANA timezone `tz`.
 * The Nuxt process runs with TZ=UTC, so all human-facing formatting must
 * convert through Intl rather than relying on Date's local getters.
 * `hourCycle: 'h23'` pins midnight to "00" across Node/ICU versions.
 */
function partsInTimezone(d: Date, tz: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  })
  const lookup: Record<string, string> = {}
  for (const p of fmt.formatToParts(d)) lookup[p.type] = p.value
  return {
    year: parseInt(lookup.year!, 10),
    month: parseInt(lookup.month!, 10),
    day: parseInt(lookup.day!, 10),
    weekday: WEEKDAY_INDEX[lookup.weekday!]!,
    hour: parseInt(lookup.hour!, 10),
    minute: parseInt(lookup.minute!, 10),
  }
}

/**
 * Group events by calendar date in timezone `tz` so the email template can
 * render one section per day. Days with no events are omitted — keeps the
 * mail compact. The bucket's `date` is noon UTC of the bucket's calendar
 * date in `tz`: stable as a sort key and as input to `formatDayHeadingDE`,
 * which re-resolves the calendar day in the same zone.
 */
export function groupEventsByDay(
  events: NewsletterEvent[],
  tz: string,
): { date: Date; events: NewsletterEvent[] }[] {
  const buckets = new Map<string, { date: Date; events: NewsletterEvent[] }>()
  for (const ev of events) {
    const p = partsInTimezone(ev.startDate, tz)
    const key = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { date: new Date(Date.UTC(p.year, p.month - 1, p.day, 12)), events: [] }
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

export function formatDayHeadingDE(d: Date, tz: string): string {
  const p = partsInTimezone(d, tz)
  return `${WEEKDAY_DE[p.weekday]}, ${p.day}. ${MONTH_DE[p.month - 1]}`
}

export function formatTimeDE(d: Date, tz: string): string {
  const p = partsInTimezone(d, tz)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

interface NewsletterLocale {
  emails: {
    weeklyNewsletter: {
      intro: string
      noEvents: string
      openEvent: string
      openCalendar: string
      footerHint: string
      settingsLink: string
      unsubscribe: string
    }
  }
  general: { greeting: string }
}

let cachedLocale: NewsletterLocale | null = null
function loadNewsletterLocale(): NewsletterLocale {
  if (!cachedLocale) {
    const file = path.join(process.cwd(), 'server/emails/_locales/de.json')
    // Einmaliges, gecachtes Lesen einer statischen Locale-Datei. renderNewsletterText
    // ist synchron und wird aus synchronen Render-Pfaden aufgerufen — async würde
    // sich durch die gesamte öffentliche API des Moduls ziehen.
    // eslint-disable-next-line n/no-sync
    cachedLocale = JSON.parse(readFileSync(file, 'utf-8')) as NewsletterLocale
  }
  return cachedLocale
}

/**
 * Soft-wrap a single line at `width` columns, breaking on spaces and
 * indenting continuation lines so the reader can tell they belong to the
 * previous line.
 */
function wrapPlainLine(line: string, width = 78, indent = '  '): string {
  if (line.length <= width) return line
  const words = line.split(' ')
  // Callers construct lines as `${prefix}[${cal}] ${title} ${url}`, so there
  // is always at least one space. Combined with line.length > width above,
  // the loop is guaranteed to push at least once and `current` is never
  // empty at the end — no fall-back branches needed.
  const out: string[] = []
  let current = words[0]!
  for (let i = 1; i < words.length; i++) {
    const w = words[i]!
    const prefix = out.length === 0 ? '' : indent
    const candidate = `${current} ${w}`
    if (prefix.length + candidate.length > width) {
      out.push(prefix + current)
      current = w
    } else {
      current = candidate
    }
  }
  out.push(indent + current)
  return out.join('\n')
}

export interface NewsletterTextDay {
  heading: string
  events: {
    title: string
    calendar: string
    allDay: boolean
    timeLabel: string
    detailUrl: string
  }[]
}

/**
 * Renders the plain-text body of the weekly newsletter with deterministic
 * line breaks. Replaces `text.pug`, whose `|`-based whitespace handling was
 * not reliable enough for a section/event/day-grouped layout.
 */
export function renderNewsletterText(args: {
  greetingName: string | null
  days: NewsletterTextDay[]
  organizationUrl: string
  settingsUrl: string
  unsubscribeUrl: string
}): string {
  const L = loadNewsletterLocale()
  const lines: string[] = []

  lines.push(
    args.greetingName ? `${L.general.greeting} ${args.greetingName},` : `${L.general.greeting},`,
  )
  lines.push('')
  lines.push(L.emails.weeklyNewsletter.intro)
  lines.push('')

  if (args.days.length === 0) {
    lines.push(L.emails.weeklyNewsletter.noEvents)
    lines.push('')
  } else {
    for (const day of args.days) {
      lines.push(day.heading.toUpperCase())
      lines.push('────────────────────────')
      for (const ev of day.events) {
        const prefix = ev.allDay ? '' : `${ev.timeLabel} `
        // Wrap only event lines — the rest stays a single line each.
        lines.push(wrapPlainLine(`${prefix}[${ev.calendar}] ${ev.title} ${ev.detailUrl}`))
      }
      lines.push('')
    }
  }

  lines.push(`${L.emails.weeklyNewsletter.openCalendar}: ${args.organizationUrl}`)
  lines.push('')
  lines.push('—')
  lines.push('')
  lines.push(L.emails.weeklyNewsletter.footerHint)
  lines.push(`${L.emails.weeklyNewsletter.settingsLink}: ${args.settingsUrl}`)
  lines.push(`${L.emails.weeklyNewsletter.unsubscribe}: ${args.unsubscribeUrl}`)

  return lines.join('\n')
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
