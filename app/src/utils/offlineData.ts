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
 * Only loaded in the installed app, and to clear it (src/utils/offlineSession.ts).
 */

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
  data: T
}

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
  const all = (await withStore('readonly', (store) => store.getAll())) as OfflineEntry<T>[]
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
