/**
 * What the installed app keeps on the device so the calendar stays readable
 * offline (docu/pwa.md, "Kalender offline"): the calendar list, the events of
 * every month looked at (plus the next one), and the events opened.
 *
 * IndexedDB rather than the service worker's cache: the calendar is read with
 * POST requests — on purpose, so that which member opened which event never
 * ends up in an access log as a URL — and the Cache API only stores GET. It
 * also keeps every entry tagged with the member it belongs to.
 *
 * Never more of the past than the member may see online: whatever ends before
 * the calendar's earliest month (shared/calendarWindow.ts) is dropped after
 * every write and at every start of the app — see pruneOfflineData().
 *
 * Only loaded in the installed app, and to clear it (src/utils/offlineSession.ts).
 */

import { earliestVisibleDate } from '~~/shared/calendarWindow'

const DB_NAME = 'jahrweiser-offline'
const STORE = 'entries'

export interface OfflineEntry<T = unknown> {
  key: string
  uid: string
  /** Epoch milliseconds — what "Stand" shows. */
  savedAt: number
  /** For event lists: which calendar and which span they cover. */
  calendar?: string
  start?: number
  end?: number
  /**
   * When what the entry describes is over — the end of a list's span, or of
   * an event — so it can be dropped once that lies before the earliest month.
   */
  until?: number
  data: T
}

/** The one entry that describes no time at all; it is replaced on every load. */
export const CALENDARS_KEY = 'calendars'

/**
 * How long an event's details are kept when their end cannot be told: about
 * as long as the two months the calendar shows of the past.
 */
export const UNDATED_MAX_AGE_MS = 61 * 24 * 60 * 60 * 1000

/** IndexedDB speaks in events; this is the one place that turns them into a promise. */
async function settled<T>(req: IDBRequest<T>): Promise<T> {
  // eslint-disable-next-line promise/avoid-new -- IndexedDB kennt nur Events; anders wird daraus kein Promise
  return new Promise((resolve, reject) => {
    req.addEventListener('success', () => {
      resolve(req.result)
    })
    req.addEventListener('error', () => {
      reject(new Error('IndexedDB request failed', { cause: req.error }))
    })
  })
}

async function openDb(): Promise<IDBDatabase> {
  const req = indexedDB.open(DB_NAME, 1)
  req.addEventListener('upgradeneeded', () => {
    req.result.createObjectStore(STORE, { keyPath: 'key' })
  })
  return settled(req)
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await settled(run(db.transaction(STORE, mode).objectStore(STORE)))
  } finally {
    // Closed after every use: an open connection would block deleteDatabase().
    db.close()
  }
}

export async function saveEntry(entry: OfflineEntry): Promise<void> {
  await withStore('readwrite', (store) => store.put(entry))
}

async function deleteKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  await withStore('readwrite', (store) => {
    // Requests in one transaction run in order: when the last one succeeded,
    // all of them did.
    const requests = keys.map((key) => store.delete(key))
    return requests.at(-1)!
  })
}

async function allEntries(): Promise<OfflineEntry[]> {
  return (await withStore('readonly', (store) => store.getAll())) as OfflineEntry[]
}

/**
 * Store an event list and drop the older lists of the same calendar it covers
 * entirely — the month grid's span contains the month fetched ahead, so
 * looking at a month replaces what was stored for it in advance.
 */
export async function saveEventList(entry: OfflineEntry & { start: number; end: number }) {
  const covered = (await allEntries()).filter(
    (other) =>
      other.key !== entry.key &&
      other.uid === entry.uid &&
      other.calendar === entry.calendar &&
      other.start !== undefined &&
      other.end !== undefined &&
      other.start >= entry.start &&
      other.end <= entry.end,
  )
  await deleteKeys(covered.map((other) => other.key))
  await saveEntry(entry)
}

/** Whether an entry describes only what the member can no longer see online. */
export function isStale(entry: OfflineEntry, earliest: number, now: number): boolean {
  if (entry.until !== undefined) return entry.until <= earliest
  if (entry.key === CALENDARS_KEY) return false
  return now - entry.savedAt > UNDATED_MAX_AGE_MS
}

/**
 * Drop everything that ended before the calendar's earliest month. Returns how
 * many entries went.
 */
export async function pruneOfflineData(now = Date.now()): Promise<number> {
  const earliest = earliestVisibleDate(new Date(now)).getTime()
  const stale = (await allEntries()).filter((entry) => isStale(entry, earliest, now))
  await deleteKeys(stale.map((entry) => entry.key))
  return stale.length
}

export async function loadEntry<T>(key: string, uid: string): Promise<OfflineEntry<T> | null> {
  const entry = (await withStore('readonly', (store) => store.get(key))) as
    OfflineEntry<T> | undefined
  return entry?.uid === uid ? entry : null
}

/** Every stored event list of `calendar` that overlaps [start, end). */
export async function loadOverlapping<T>(
  uid: string,
  calendar: string,
  start: number,
  end: number,
): Promise<OfflineEntry<T>[]> {
  const all = (await allEntries()) as OfflineEntry<T>[]
  return all.filter(
    (entry) =>
      entry.uid === uid &&
      entry.calendar === calendar &&
      entry.start !== undefined &&
      entry.end !== undefined &&
      entry.start < end &&
      entry.end > start,
  )
}

/** The whole database. The page cache and the deadline: purgeOfflineData(). */
export async function deleteOfflineDatabase(): Promise<void> {
  await settled(indexedDB.deleteDatabase(DB_NAME))
}
