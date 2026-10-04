/**
 * What kind of device the app runs on — for the one decision that needs it:
 * which part of the installable-app code a visitor gets at all (docu/pwa.md).
 *
 * Kept tiny on purpose: this file is in the entry bundle every desktop visitor
 * downloads; everything that follows from its answer is loaded on demand.
 *
 * Every function takes the environment as an argument rather than reading
 * `navigator` itself, so the heuristics can be tested against real user-agent
 * strings without faking the browser globals. `deviceEnv()` reads the real one.
 *
 * It is a heuristic and is allowed to be wrong in edge cases: the worst outcome
 * is an install offer on a device that would not need one, or none on a device
 * that could have used it — never a broken page.
 */

/** The parts of `navigator`/`window` the heuristics read. */
export interface DeviceEnv {
  userAgent: string
  maxTouchPoints: number
  /** User-Agent Client Hints — Chromium only. */
  userAgentData?: { mobile?: boolean; platform?: string }
  /** iOS Safari's own flag for "started from the home screen". */
  standalone?: boolean
  matchMedia: (query: string) => { matches: boolean }
}

export function deviceEnv(): DeviceEnv {
  const nav = navigator as Navigator & {
    userAgentData?: DeviceEnv['userAgentData']
    standalone?: boolean
  }
  return {
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints,
    userAgentData: nav.userAgentData,
    standalone: nav.standalone,
    matchMedia: (query) => window.matchMedia(query),
  }
}

/** Phones and tablets announce themselves with one of these tokens. */
const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Windows Phone|Opera Mini/i

/**
 * iPadOS 13+ Safari asks for desktop sites and sends a Mac user agent. A Mac
 * has no touch screen, so a "Mac" with several touch points and a coarse
 * pointer is an iPad.
 */
export function isDesktopClassIPad(env: DeviceEnv): boolean {
  return (
    env.userAgent.includes('Macintosh') &&
    env.maxTouchPoints > 1 &&
    env.matchMedia('(pointer: coarse)').matches
  )
}

/**
 * Phone or tablet. Client Hints first — Chromium answers `mobile` directly and
 * names the platform, which also catches Android tablets (`mobile: false`).
 * Everything else (Safari, Firefox) is judged by its user agent.
 */
export function isMobileDevice(env: DeviceEnv): boolean {
  const hints = env.userAgentData
  if (hints && typeof hints.mobile === 'boolean') {
    return hints.mobile || hints.platform === 'Android' || hints.platform === 'iOS'
  }
  return MOBILE_UA.test(env.userAgent) || isDesktopClassIPad(env)
}

/** Running as the installed app, started from the home screen. */
export function isStandalone(env: DeviceEnv): boolean {
  return env.standalone === true || env.matchMedia('(display-mode: standalone)').matches
}

/**
 * The three ways the app is used, each with its own code (docu/pwa.md):
 *
 * - `installed`: started from the home screen — service worker with the full
 *   precache, manifest link (Android reads it to update the installed app).
 * - `mobile`:    phone or tablet browser — manifest link and install hint, no
 *   service worker: no precache over mobile data for someone who never
 *   installs.
 * - `desktop`:   nothing at all.
 */
export type PwaMode = 'installed' | 'mobile' | 'desktop'

export function pwaMode(env: DeviceEnv): PwaMode {
  if (isStandalone(env)) return 'installed'
  return isMobileDevice(env) ? 'mobile' : 'desktop'
}
