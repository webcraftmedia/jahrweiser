import type { DeviceEnv } from '~/utils/device'

import { deviceEnv, isDesktopClassIPad } from '~/utils/device'
import {
  appInstalled,
  installPrompt,
  installRequested,
  openInstallPrompt,
} from '~/utils/installPrompt'

/**
 * The install hint's logic. Only the lazily loaded InstallHint component uses
 * it, so none of this reaches a desktop browser — whether a visitor is shown
 * the hint at all is decided in src/plugins/pwa.client.ts (phone or tablet
 * browser, not the installed app).
 */

export type InstallMethod = 'prompt' | 'share' | 'safari' | 'menu'

/** Per device, not per member: it is the device that does or does not have the app. */
export const INSTALL_HINT_DISMISSED_KEY = 'jahrweiser-install-hint-dismissed'

/**
 * How often the app offers itself: dismissed, the hint comes back after
 * `INSTALL_HINT_PAUSE_MS`, and after the third time not at all. Asking for it
 * (menu, project page) is always possible — see `installRequested`.
 */
export const INSTALL_HINT_MAX_OFFERS = 3
export const INSTALL_HINT_PAUSE_MS = 30 * 24 * 60 * 60 * 1000

/** How often the hint was dismissed on this device, and until when it rests. */
export interface HintDismissal {
  count: number
  until: number
}

export function isIOS(env: DeviceEnv): boolean {
  return /iPhone|iPad|iPod/.test(env.userAgent) || isDesktopClassIPad(env)
}

/**
 * iOS version as a comparable number, major × 100 + minor (16.4 → 1604; a
 * decimal would put 16.10 below 16.4), or null if the user agent does not say.
 * iPhone UAs carry `OS 16_4`; the desktop-class iPad UA only has Safari's
 * `Version/16.4`.
 */
export function iosVersion(env: DeviceEnv): number | null {
  const match = /OS (\d+)_(\d+)/.exec(env.userAgent) ?? /Version\/(\d+)\.(\d+)/.exec(env.userAgent)
  return match ? Number(match[1]) * 100 + Number(match[2]) : null
}

/** Other iOS browsers. All of them are WebKit underneath. */
const IOS_OTHER_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|Ddg\//
/** In-app web views (Facebook, Instagram, Line, Google app, WeChat). */
const IOS_IN_APP = /FBAN|FBAV|Instagram|Line\/|GSA\/|MicroMessenger/

/**
 * How a member can put the app on the home screen without an install event:
 *
 * - `share`:  iOS Safari, or since iOS 16.4 any other iOS browser — "Teilen →
 *             Zum Home-Bildschirm".
 * - `safari`: older iOS browsers and in-app web views cannot do that at all;
 *             the way is to open the page in Safari.
 * - `menu`:   Android browsers without `beforeinstallprompt` (Firefox) have
 *             an entry in their own menu.
 * - null:     Chromium — it fires `beforeinstallprompt` when it is ready to
 *             install, or not at all if the app is already installed. The
 *             hint waits for that event instead.
 */
export function manualInstallMethod(
  env: DeviceEnv,
  hasInstallPrompt: boolean,
): 'share' | 'safari' | 'menu' | null {
  if (isIOS(env)) {
    const ua = env.userAgent
    if (IOS_IN_APP.test(ua)) return 'safari'
    if (!IOS_OTHER_BROWSER.test(ua)) return 'share'
    return (iosVersion(env) ?? 0) >= 1604 ? 'share' : 'safari'
  }
  return hasInstallPrompt ? null : 'menu'
}

const NEVER_DISMISSED: HintDismissal = { count: 0, until: 0 }

export function readDismissal(): HintDismissal {
  try {
    const raw = JSON.parse(localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) ?? 'null') as unknown
    const { count, until } = (raw ?? {}) as Partial<HintDismissal>
    return typeof count === 'number' && typeof until === 'number'
      ? { count, until }
      : NEVER_DISMISSED
    // eslint-disable-next-line no-catch-all/no-catch-all -- storage blocked or unreadable: the hint is simply shown
  } catch {
    return NEVER_DISMISSED
  }
}

/** Whether the app may offer itself now, after `dismissal`. */
export function mayOffer(dismissal: HintDismissal, now: number): boolean {
  return dismissal.count < INSTALL_HINT_MAX_OFFERS && now >= dismissal.until
}

/**
 * Whether and how to suggest installing the app; null hides the hint. Not
 * after an install, and only as often as `mayOffer` allows — unless the member
 * asked for it.
 */
export function useInstallHint() {
  const env = deviceEnv()
  const offered = ref(mayOffer(readDismissal(), Date.now()))

  const method = computed<InstallMethod | null>(() => {
    if (appInstalled.value || !(offered.value || installRequested.value)) return null
    if (installPrompt.value) return 'prompt'
    return manualInstallMethod(env, 'onbeforeinstallprompt' in window)
  })

  /**
   * Closing a hint the member asked for counts for nothing: it was their
   * question, not the app's offer.
   */
  function dismiss() {
    if (installRequested.value) {
      installRequested.value = false
      if (!offered.value) return
    }
    offered.value = false
    const count = readDismissal().count + 1
    try {
      localStorage.setItem(
        INSTALL_HINT_DISMISSED_KEY,
        JSON.stringify({ count, until: Date.now() + INSTALL_HINT_PAUSE_MS }),
      )
      // eslint-disable-next-line no-catch-all/no-catch-all -- storage blocked: hidden for this visit, back on the next
    } catch {
      // Nothing to do.
    }
  }

  /** Opens the browser's install dialog. The event can be used only once. */
  async function install() {
    await openInstallPrompt()
  }

  return { method, install, dismiss }
}
