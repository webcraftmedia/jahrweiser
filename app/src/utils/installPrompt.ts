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

/** Installed during this visit — through the hint or the browser menu. */
export const appInstalled = ref(false)

/**
 * Whether this visitor may see the install hint: a phone or tablet browser.
 * Set only after the app has mounted, so the server-rendered page and the
 * first client render agree on "no hint".
 */
export const installHintEligible = ref(false)

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
