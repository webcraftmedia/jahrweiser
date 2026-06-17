// Session lifetime policy: sliding expiry with an absolute cap.
//
// The authoritative gate is `sessions.expiresAt` in the DB, enforced by the
// session-check middleware on every request. On activity the middleware pushes
// expiresAt forward by IDLE_TTL (sliding "remember me"), but never past
// ABSOLUTE_TTL measured from session creation. The sealed auth cookie is issued
// for ABSOLUTE_TTL so the browser keeps sending it until the hard cap; whether
// it is still valid is decided server-side via expiresAt.

export const IDLE_TTL_SECONDS = 60 * 60 * 24 * 7 // 7d of inactivity -> logout
export const ABSOLUTE_TTL_SECONDS = 60 * 60 * 24 * 90 // 90d hard cap from login

export const IDLE_TTL_MS = IDLE_TTL_SECONDS * 1000
export const ABSOLUTE_TTL_MS = ABSOLUTE_TTL_SECONDS * 1000

/**
 * Next expiry for a sliding session: extend by the idle window from `now`,
 * clamped to the absolute cap measured from `createdAt`. Returns a value in the
 * past once the cap is exceeded, which the middleware treats as expired.
 */
export function nextExpiry(now: number, createdAt: number): number {
  return Math.min(now + IDLE_TTL_MS, createdAt + ABSOLUTE_TTL_MS)
}
