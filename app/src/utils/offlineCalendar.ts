import { offlineSessionEnabled, offlineSessionValid } from './offlineSession'

import type { OfflineEntry } from './offlineData'

/**
 * The calendar's reads, with the installed app's offline copy behind them
 * (docu/pwa.md, "Kalender offline"): online every answer is also stored on the
 * device; when the network is gone, the stored answer is shown instead — but
 * only to the member it belongs to, and only until the session would have run
 * out (src/utils/offlineSession.ts).
 *
 * Outside the installed app every function here is a plain pass-through —
 * the very same promise the request returns, not one wrapped in another — and
 * the storage code is never loaded.
 */

/** Whether the offline copy is in play for this member at all. */
function active(uid: string | undefined): uid is string {
  return offlineSessionEnabled() && !!uid
}

/** The fields of an event list entry this file needs. */
interface CalendarEvent {
  id: string
  occurrence?: number
  startDate: string | Date
  endDate: string | Date
}

/**
 * When the shown data was stored, or null while it comes from the server —
 * what the calendar's "Offline – Stand: …" line reads.
 */
export function useOfflineStand() {
  return useState<number | null>('offline-stand', () => null)
}

/** A request that never reached the server, as opposed to one it refused. */
export function isNetworkError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'FetchError' &&
    (error as { response?: unknown }).response === undefined
  )
}

/** Loaded on first use, then kept: one module for every read and write after. */
let storageModule: Promise<typeof import('./offlineData')> | undefined
async function storage() {
  storageModule ??= import('./offlineData')
  return storageModule
}

/** Storing must never hold up the calendar, nor break it. */
async function keep(save: () => Promise<void>) {
  try {
    await save()
    // eslint-disable-next-line no-catch-all/no-catch-all -- Ablegen fuer offline ist Beiwerk: misslingt es, bleibt der Kalender eben nur online lesbar
  } catch (error) {
    console.warn('Could not keep the calendar for offline use:', error)
  }
}

/**
 * Read through the network, keep a copy, fall back to it offline. A refusal
 * from the server (401, 403, 404 …) is passed on as it is — a 401 must still end
 * in the logout, and a stored answer must not paper over it.
 */
async function readThrough<T>(
  uid: string,
  fetcher: () => Promise<T>,
  save: (data: T, savedAt: number) => Promise<void>,
  fallback: () => Promise<{ data: T; savedAt: number } | null>,
): Promise<T> {
  const stand = useOfflineStand()
  try {
    const data = await fetcher()
    stand.value = null
    void keep(async () => save(data, Date.now()))
    return data
  } catch (error) {
    if (!isNetworkError(error) || !offlineSessionValid(uid)) throw error
    const stored = await fallback()
    if (!stored) throw error
    stand.value = stand.value === null ? stored.savedAt : Math.min(stand.value, stored.savedAt)
    return stored.data
  }
}

// eslint-disable-next-line @typescript-eslint/promise-function-async -- bewusst nicht async: ausserhalb der App das unveraenderte Promise der Anfrage
export function readCalendars<T>(uid: string | undefined, fetcher: () => Promise<T>) {
  if (!active(uid)) return fetcher()
  const key = 'calendars'
  return readThrough(
    uid,
    fetcher,
    async (data, savedAt) => (await storage()).saveEntry({ key, uid, savedAt, data }),
    async () => (await storage()).loadEntry<T>(key, uid),
  )
}

function timeOf(value: string | Date): number {
  return new Date(value).getTime()
}

function oldest(entries: OfflineEntry[]): number {
  return Math.min(...entries.map((entry) => entry.savedAt))
}

/** The events of all lists that fall into [start, end), each once. */
export function mergeEvents<T extends CalendarEvent>(
  entries: OfflineEntry<T[]>[],
  start: number,
  end: number,
): T[] {
  const seen = new Map<string, T>()
  // Newest list first, so an event stored twice shows its latest state.
  for (const entry of [...entries].sort((a, b) => b.savedAt - a.savedAt)) {
    for (const event of entry.data) {
      const key = `${event.id}:${event.occurrence ?? ''}`
      if (!seen.has(key) && timeOf(event.startDate) < end && timeOf(event.endDate) >= start) {
        seen.set(key, event)
      }
    }
  }
  return [...seen.values()]
}

/**
 * Offline, a month is put together from whatever stored lists overlap it — the
 * month grid asks for a span from the Monday before the 1st to the Sunday
 * after the last day, which the stored "next month" never matches exactly.
 */
// eslint-disable-next-line @typescript-eslint/promise-function-async -- bewusst nicht async: ausserhalb der App das unveraenderte Promise der Anfrage
export function readCalendarEvents<T extends CalendarEvent>(
  uid: string | undefined,
  calendar: string,
  startDate: Date,
  endDate: Date,
  fetcher: () => Promise<T[]>,
) {
  if (!active(uid)) return fetcher()
  const start = startDate.getTime()
  const end = endDate.getTime()
  return readThrough(
    uid,
    fetcher,
    async (data, savedAt) =>
      (await storage()).saveEntry({
        key: `events:${calendar}:${start}:${end}`,
        uid,
        savedAt,
        calendar,
        start,
        end,
        data,
      }),
    async () => {
      const entries = await (await storage()).loadOverlapping<T[]>(uid, calendar, start, end)
      if (entries.length === 0) return null
      return { data: mergeEvents(entries, start, end), savedAt: oldest(entries) }
    },
  )
}

// eslint-disable-next-line @typescript-eslint/promise-function-async -- bewusst nicht async: ausserhalb der App das unveraenderte Promise der Anfrage
export function readEvent<T>(
  uid: string | undefined,
  calendar: string,
  id: string,
  occurrence: number | undefined,
  fetcher: () => Promise<T>,
) {
  if (!active(uid)) return fetcher()
  const key = `event:${calendar}:${id}:${occurrence ?? ''}`
  return readThrough(
    uid,
    fetcher,
    async (data, savedAt) => (await storage()).saveEntry({ key, uid, savedAt, data }),
    async () => (await storage()).loadEntry<T>(key, uid),
  )
}

/**
 * The calendar month after `year`/`month` (1-based) as a [start, end) pair of
 * local midnights — what the installed app fetches ahead, so the next month is
 * there offline even if nobody looked at it.
 */
export function nextMonthRange(year: number, month: number): { start: Date; end: Date } {
  return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) }
}
