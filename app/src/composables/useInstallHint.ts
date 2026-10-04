import type { DeviceEnv } from '~/utils/device'

import { deviceEnv, isDesktopClassIPad } from '~/utils/device'
import { appInstalled, installPrompt } from '~/utils/installPrompt'

/**
 * The install hint's logic. Only the lazily loaded InstallHint component uses
 * it, so none of this reaches a desktop browser — whether a visitor is shown
 * the hint at all is decided in src/plugins/pwa.client.ts (phone or tablet
 * browser, not the installed app).
 */

export type InstallMethod = 'prompt' | 'share' | 'safari' | 'menu'

/** Per device, not per member: it is the device that does or does not have the app. */
export const INSTALL_HINT_DISMISSED_KEY = 'jahrweiser-install-hint-dismissed'

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

function readDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) === '1'
    // eslint-disable-next-line no-catch-all/no-catch-all -- storage blocked (privacy settings): the hint is simply shown
  } catch {
    return false
  }
}

/**
 * Whether and how to suggest installing the app; null hides the hint. Never
 * again once dismissed on this device, and not after an install.
 */
export function useInstallHint() {
  const env = deviceEnv()
  const dismissed = ref(readDismissed())

  const method = computed<InstallMethod | null>(() => {
    if (dismissed.value || appInstalled.value) return null
    if (installPrompt.value) return 'prompt'
    return manualInstallMethod(env, 'onbeforeinstallprompt' in window)
  })

  function dismiss() {
    dismissed.value = true
    try {
      localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, '1')
      // eslint-disable-next-line no-catch-all/no-catch-all -- storage blocked: hidden for this visit, back on the next
    } catch {
      // Nothing to do.
    }
  }

  /** Opens the browser's install dialog. The event can be used only once. */
  async function install() {
    const prompt = installPrompt.value
    if (!prompt) return
    installPrompt.value = null
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') appInstalled.value = true
  }

  return { method, install, dismiss }
}
