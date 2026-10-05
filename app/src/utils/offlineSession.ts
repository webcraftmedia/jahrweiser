/**
 * How long the installed app may show the calendar it keeps on the device
 * while offline: exactly as long as the server would still let the member in
 * (docu/pwa.md, "Kalender offline").
 *
 * The session cookie cannot say — it is httpOnly, sealed, and lives for the
 * absolute cap regardless of the sliding idle window. So the server sends the
 * remaining seconds with every authenticated response (shared/session.ts), and
 * this file turns them into a deadline on the device's own clock.
 *
 * Kept tiny: it sits in the entry bundle, because the HTTP client reads the
 * header on every response. Everything that stores data is in
 * src/utils/offlineData.ts and only loaded where it is needed.
 */

const STORAGE_KEY = 'jahrweiser-offline-session'

/** The service worker's cache for calendar pages — see `pwa.workbox` in nuxt.config.ts. */
export const PAGES_CACHE = 'jahrweiser-pages'

export interface OfflineSession {
  uid: string
  /** Epoch milliseconds on this device's clock. */
  deadline: number
}

/** Switched on by src/plugins/pwa.client.ts for the installed app only. */
let enabled = false

export function enableOfflineSession(): void {
  enabled = true
}

export function offlineSessionEnabled(): boolean {
  return enabled
}

export function readOfflineSession(): OfflineSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<OfflineSession>
    return typeof parsed.uid === 'string' && typeof parsed.deadline === 'number'
      ? { uid: parsed.uid, deadline: parsed.deadline }
      : null
    // eslint-disable-next-line no-catch-all/no-catch-all -- Speicher gesperrt oder Inhalt kaputt: dann gibt es eben keine Offline-Sitzung
  } catch {
    return null
  }
}

/** Whether the stored data may still be shown to `uid` at `now`. */
export function offlineSessionValid(uid: string | undefined, now = Date.now()): boolean {
  const session = readOfflineSession()
  return !!uid && session?.uid === uid && session.deadline > now
}

export function forgetOfflineSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    // eslint-disable-next-line no-catch-all/no-catch-all -- Speicher gesperrt: es gibt dann auch nichts zu vergessen
  } catch {
    // See above.
  }
}

/**
 * Remove everything the installed app keeps for offline use. Called on logout,
 * on a 401, on a different member signing in and once the deadline passed.
 *
 * Runs in every mode, not only in the installed app: on Android the app and
 * Chrome share their storage and the worker, so a logout in a browser tab has
 * to clear what the app stored. The page cache goes right here; the storage
 * code is only loaded when the marker in localStorage says there is data.
 */
export async function purgeOfflineData(): Promise<void> {
  if (typeof caches !== 'undefined') await caches.delete(PAGES_CACHE).catch(() => false)
  if (!readOfflineSession()) return
  forgetOfflineSession()
  const { deleteOfflineDatabase } = await import('./offlineData')
  await deleteOfflineDatabase()
}

/**
 * Record the remaining session time from a response header. A different member
 * than the one the stored data belongs to clears it first — cached pages carry
 * the previous member's name.
 */
export async function recordSessionExpiry(
  uid: string | undefined,
  header: string | null,
  now = Date.now(),
): Promise<void> {
  if (!enabled || !uid || header === null) return
  const seconds = Number(header)
  if (!Number.isFinite(seconds)) return
  const previous = readOfflineSession()
  if (previous && previous.uid !== uid) await purgeOfflineData()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ uid, deadline: now + seconds * 1000 }))
    // eslint-disable-next-line no-catch-all/no-catch-all -- Speicher gesperrt: dann bleibt der Kalender eben nur online lesbar
  } catch {
    // Nothing to do: without a deadline the stored data is never shown.
  }
}
