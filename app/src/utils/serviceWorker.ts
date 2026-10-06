import { PAGES_CACHE } from './offlineSession'

/** The worker's cache for the translations — see `pwa.workbox` in nuxt.config.ts. */
export const MESSAGES_CACHE = 'jahrweiser-i18n'

/** Path and scope of the service worker that @vite-pwa/nuxt generates. */
export const SERVICE_WORKER_URL = '/sw.js'

/**
 * What an offline start opens: the manifest's `start_url`, and the plain root
 * for apps installed before it carried its mark.
 */
export const START_PAGES = ['/?app', '/']

/**
 * Put the pages an offline start opens into the worker's page cache — the
 * calendar as the member sees it right now.
 *
 * The worker only keeps a page that a navigation fetched through it. The very
 * first start of the installed app is the one that registers it, usually
 * still logged out; after the login the app only changes pages client-side.
 * Without this, an app installed, opened once and then taken offline had its
 * data in IndexedDB but no page to show it in — only the offline notice
 * (docu/pwa.md, "Kalender offline"). Hence src/plugins/pwa.client.ts calls
 * this whenever a member is logged in and the worker is ready.
 *
 * Same rules as the worker's own caching: only a real page, never a redirect
 * (logged out, that is the login page under a calendar address). Best effort:
 * whatever fails is simply not kept.
 */
export async function keepStartPages(urls: string[], win: Window = window): Promise<void> {
  if (!('caches' in win) || !win.navigator.onLine) return
  const cache = await win.caches.open(PAGES_CACHE)
  await Promise.all(
    [...new Set(urls)].map(async (url) => {
      try {
        const response = await win.fetch(url, { credentials: 'same-origin' })
        if (response.ok && !response.redirected) await cache.put(url, response)
        // eslint-disable-next-line no-catch-all/no-catch-all -- Vorhalten fuer offline ist Beiwerk: eine fehlende Seite bleibt eben ungespeichert
      } catch {
        // Not kept; the next start online tries again.
      }
    }),
  )
}

/**
 * Keep the translations this page loaded (`/_i18n/<hash>/de/messages.json`)
 * for an offline start — the same gap as the start pages: the worker caches
 * them from the second start on, but the first one fetched them past it.
 * Found in the page's resource timing, so no build hash has to be known here.
 */
export async function keepMessages(win: Window = window): Promise<void> {
  if (!('caches' in win) || !win.navigator.onLine) return
  const urls = win.performance
    .getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => new URL(name).pathname.startsWith('/_i18n/'))
  if (urls.length === 0) return
  const cache = await win.caches.open(MESSAGES_CACHE)
  await Promise.all(
    [...new Set(urls)].map(async (url) => {
      try {
        if (await cache.match(url)) return
        const response = await win.fetch(url)
        if (response.ok) await cache.put(url, response)
        // eslint-disable-next-line no-catch-all/no-catch-all -- Vorhalten fuer offline ist Beiwerk: fehlt es, holt es der naechste Start
      } catch {
        // Not kept; the worker stores it on the next start online.
      }
    }),
  )
}

/**
 * Registers the service worker — feature-detected, so a browser without
 * service workers simply runs the app as it always has, and deferred to the
 * `load` event, so installing it (which downloads the precache) never competes
 * with the page the member is waiting for.
 *
 * `enabled` is false in development: there is no service worker there, and a
 * stale one would serve old bundles against new code (docu/pwa.md).
 */
export function registerServiceWorker(enabled: boolean, win: Window = window): void {
  if (!enabled || !('serviceWorker' in win.navigator)) return

  const register = () => {
    // A failed registration (private mode in some browsers, an operator's
    // kill switch) leaves the app exactly as it was without one — nothing to
    // tell the member about.
    win.navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' }).catch(() => {})
  }

  if (win.document.readyState === 'complete') register()
  else win.addEventListener('load', register, { once: true })
}
