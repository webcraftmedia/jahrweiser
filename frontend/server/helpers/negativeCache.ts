// In-process negative cache for login email lookups: remembers addresses that
// matched no user so repeated attempts (e.g. bots probing random addresses)
// don't hammer CardDAV on every try. Kept short and explicitly invalidated by
// sync, so a freshly-added user can log in promptly instead of being stuck
// behind a stale "not found" for the full TTL.
//
// Per-process only: with multiple app instances each keeps its own cache; the
// short TTL bounds how long a cross-instance entry can stay stale.
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000 // 5 min

const cache = new Map<string, number>()

/** Remember that `email` (already normalized/lowercased) matched no user. */
export function markEmailNotFound(email: string): void {
  cache.set(email, Date.now())
}

/** Whether `email` is currently cached as not-found (lazily evicts on expiry). */
export function isEmailNotFound(email: string): boolean {
  const ts = cache.get(email)
  if (ts === undefined) return false
  if (Date.now() - ts > NEGATIVE_CACHE_TTL_MS) {
    cache.delete(email)
    return false
  }
  return true
}

/** Drop any not-found entry for `email` (call when the user becomes known). */
export function clearEmailNotFound(email: string): void {
  cache.delete(email)
}
