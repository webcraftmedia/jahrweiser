/** Path and scope of the service worker that @vite-pwa/nuxt generates. */
export const SERVICE_WORKER_URL = '/sw.js'

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
