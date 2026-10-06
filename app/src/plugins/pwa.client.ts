import { isCalendarPath } from '~/utils/calendarPath'
import { canInstall, deviceEnv, pwaMode } from '~/utils/device'
import {
  installHintEligible,
  installUnsupported,
  listenForInstallPrompt,
  rememberAppLaunch,
} from '~/utils/installPrompt'
import {
  enableOfflineSession,
  offlineSessionValid,
  purgeOfflineData,
  readOfflineSession,
} from '~/utils/offlineSession'
import { pwaHeadLinks } from '~/utils/pwaHead'

/**
 * At every start, the copy on the device is brought in line (docu/pwa.md):
 *
 * - started offline with a session that has run out since: it is no longer
 *   the member's to see. Clear it and go to the login, which offline is the
 *   worker's offline page.
 * - otherwise: drop what ended before the calendar's earliest month — a phone
 *   left alone for weeks would else keep showing months long out of reach.
 */
export async function checkOfflineCopy(now = Date.now()) {
  const session = readOfflineSession()
  if (!session) return
  if (navigator.onLine || offlineSessionValid(session.uid, now)) {
    try {
      const { pruneOfflineData } = await import('~/utils/offlineData')
      await pruneOfflineData(now)
      // eslint-disable-next-line no-catch-all/no-catch-all -- Aufraeumen ist Beiwerk: misslingt es, holt es das naechste Speichern nach
    } catch (error) {
      console.warn('Could not tidy the offline copy:', error)
    }
    return
  }
  try {
    await purgeOfflineData()
    // eslint-disable-next-line no-catch-all/no-catch-all -- Loeschen gescheitert: trotzdem weg von den Daten, zum Login
  } catch (error) {
    console.warn('Could not clear the offline copy:', error)
  }
  window.location.replace('/login')
}

/** Loads the registration code only for the installed app. */
async function startServiceWorker(enabled: boolean) {
  const { registerServiceWorker } = await import('~/utils/serviceWorker')
  registerServiceWorker(enabled)
}

/**
 * The address this start really asked for, from the browser's navigation
 * entry — not from the router, which may say something else (see
 * openLaunchedAddress).
 */
export function launchedAddress(): string | null {
  const [entry] = performance.getEntriesByType('navigation')
  if (!entry) return null
  const url = new URL(entry.name)
  return url.pathname + url.search
}

/**
 * Offline, the worker answers any calendar address it has no page for with the
 * stored start page (`pwa.workbox` in nuxt.config.ts). Nuxt then hydrates on
 * that page's path, not the address — the app would show this month for a
 * start on /2026/11 or an event. Once mounted, go where the start pointed.
 * Online the server renders the right page, and nothing happens here.
 */
export function openLaunchedAddress(router = useRouter()): void {
  const launched = launchedAddress()
  if (!launched || launched === router.currentRoute.value.fullPath) return
  if (!isCalendarPath(new URL(launched, 'http://x').pathname)) return
  void router.replace(launched)
}

/**
 * Keep the start pages for an offline start, once the worker is ready — see
 * keepStartPages. Run whenever a member is logged in: on a start that already
 * is, and right after the login on a first start that is not.
 */
export async function keepStartPagesWhenReady(): Promise<void> {
  await navigator.serviceWorker.ready
  const { START_PAGES, keepMessages, keepStartPages } = await import('~/utils/serviceWorker')
  await Promise.all([keepStartPages(START_PAGES), keepMessages()])
}

/**
 * Decides which part of the installable-app code a visitor gets (docu/pwa.md):
 *
 * - desktop browser: nothing. No manifest link — its presence is what makes
 *   Chrome and Edge put an install button into the address bar — and no
 *   service worker.
 * - phone or tablet browser: the manifest link and the install hint (a lazy
 *   chunk, see layouts/default.vue). No service worker: its precache would be
 *   a download over mobile data for everyone who never installs.
 * - installed app: the manifest link (Android re-reads it to update the
 *   installed app) and the service worker with the full precache, loaded on
 *   demand.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const env = deviceEnv()
  const mode = pwaMode(env)
  if (mode === 'desktop') return

  // Usually already in the server-rendered page (src/plugins/pwa.server.ts);
  // the same keys make this a no-op then.
  useHead({ link: pwaHeadLinks() })
  // Started from the home screen (`start_url` carries the mark), whether or
  // not the browser reports standalone: the hint has done its job.
  rememberAppLaunch(new URLSearchParams(window.location.search))

  if (mode === 'installed') {
    nuxtApp.hook('app:mounted', () => {
      openLaunchedAddress()
    })
    // The calendar kept on the device for offline use (docu/pwa.md).
    enableOfflineSession()
    nuxtApp.hook('app:mounted', () => {
      void checkOfflineCopy()
    })
    // Not awaited: the app must not wait for the worker. No worker exists in
    // development, and none is registered while the kill switch is on — the
    // self-destroying one would otherwise be re-registered after every
    // reload it triggers. A chunk that fails to load leaves the app as it is
    // without a worker.
    const enabled = useRuntimeConfig().public.serviceWorker && !import.meta.dev
    startServiceWorker(enabled).catch(() => {})
    if (enabled && 'serviceWorker' in navigator) {
      const { loggedIn } = useUserSession()
      nuxtApp.hook('app:mounted', () => {
        watch(
          loggedIn,
          (isLoggedIn) => {
            if (isLoggedIn) keepStartPagesWhenReady().catch(() => {})
          },
          { immediate: true },
        )
      })
    }
    return
  }

  listenForInstallPrompt()
  nuxtApp.hook('app:mounted', () => {
    // Only where installing is real — never point anyone at a shortcut.
    if (canInstall(env, 'onbeforeinstallprompt' in window)) installHintEligible.value = true
    else installUnsupported.value = true
  })
})
