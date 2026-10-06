/**
 * The little install state that has to exist before the install hint is
 * loaded: Chromium fires `beforeinstallprompt` once, early after load, and the
 * hint chunk is only fetched when a page that shows it renders — often later.
 * In the entry bundle, so it stays this small; the hint itself is lazy.
 */

/** Chromium's install event; not in the DOM typings (not a standard). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** The kept event, until it is used (once) or the app gets installed. */
export const installPrompt = shallowRef<BeforeInstallPromptEvent | null>(null)

/**
 * The app is installed on this device: installed during this visit, or
 * started from the home screen at some point (see rememberAppLaunch).
 */
export const appInstalled = ref(false)

/**
 * Set on this device once the app was started from the home screen — the
 * manifest's `start_url` carries `?app` for exactly that. A browser tab on the
 * same device then knows the app is there and stops suggesting it.
 */
export const APP_LAUNCHED_KEY = 'jahrweiser-app-launched'

export function rememberAppLaunch(query: URLSearchParams): void {
  // This start counts in any case; remembering it is what may fail.
  if (query.has('app')) appInstalled.value = true
  try {
    if (appInstalled.value) localStorage.setItem(APP_LAUNCHED_KEY, '1')
    else if (localStorage.getItem(APP_LAUNCHED_KEY) === '1') appInstalled.value = true
    // eslint-disable-next-line no-catch-all/no-catch-all -- Speicher gesperrt: dann eben ohne Erinnerung, der Hinweis bleibt
  } catch {
    // Nothing to do: the hint simply returns on the next visit in a tab.
  }
}

/**
 * A phone or tablet browser that cannot install the app (Firefox and its
 * relatives on Android — see canInstall in src/utils/device.ts). The project
 * page says where it works instead.
 */
export const installUnsupported = ref(false)

/**
 * Whether this visitor may see the install hint: a phone or tablet browser.
 * Set only after the app has mounted, so the server-rendered page and the
 * first client render agree on "no hint".
 */
export const installHintEligible = ref(false)

/**
 * The member asked to install — from the menu or the project page. Shows the
 * hint whatever became of it before: dismissing it stops the app from
 * *offering*, not the member from *asking*.
 */
export const installRequested = ref(false)

/**
 * Open Chromium's install dialog, if it offered one. The event can be used
 * only once, and only from a click — which is where both callers come from.
 * Returns whether there was a dialog to open.
 */
export async function openInstallPrompt(): Promise<boolean> {
  const prompt = installPrompt.value
  if (!prompt) return false
  installPrompt.value = null
  await prompt.prompt()
  const { outcome } = await prompt.userChoice
  if (outcome === 'accepted') appInstalled.value = true
  return true
}

/**
 * "Als App installieren" from the menu or the project page: Chromium's dialog
 * right away, everywhere else the hint with the steps for this browser.
 */
export async function requestInstall(): Promise<void> {
  if (!(await openInstallPrompt())) installRequested.value = true
}

export function listenForInstallPrompt(target: Window = window): void {
  target.addEventListener('beforeinstallprompt', (event) => {
    // Stops Chromium's own install banner; the hint offers the same prompt
    // at a moment of the member's choosing.
    event.preventDefault()
    installPrompt.value = event as BeforeInstallPromptEvent
  })
  target.addEventListener('appinstalled', () => {
    installPrompt.value = null
    appInstalled.value = true
  })
}
