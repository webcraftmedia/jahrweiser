/**
 * Files the browser must re-check on every load (docu/pwa.md):
 *
 * - `/sw.js`: a cached service worker is the one cache that can lock the
 *   installed app out of an update — or out of the kill switch. Browsers skip
 *   the HTTP cache for it after 24 h anyway; `no-cache` makes it every time.
 * - `/manifest.webmanifest`: a stale one keeps old names and icon URLs.
 * - `/offline.html`: precached by the worker; revalidating keeps it in step.
 *
 * `no-cache` still allows a conditional request (304), so it costs a round
 * trip, not a download.
 */
export const REVALIDATE_PATHS: ReadonlySet<string> = new Set([
  '/sw.js',
  '/manifest.webmanifest',
  '/offline.html',
])

/** The Cache-Control value for a request path (with or without query), if any. */
export function revalidateHeader(path: string): string | undefined {
  const pathname = path.split('?', 1)[0] as string
  return REVALIDATE_PATHS.has(pathname) ? 'no-cache' : undefined
}
