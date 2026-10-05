import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { env, UA } from '../../test/helpers/device-env'
import { isIOS } from '../utils/device'
import { appInstalled, installPrompt, installRequested } from '../utils/installPrompt'

import {
  INSTALL_HINT_DISMISSED_KEY,
  INSTALL_HINT_MAX_OFFERS,
  INSTALL_HINT_PAUSE_MS,
  mayOffer,
  readDismissal,
  iosVersion,
  manualInstallMethod,
  useInstallHint,
} from './useInstallHint'

import type { DeviceEnv } from '../utils/device'
import type { BeforeInstallPromptEvent } from '../utils/installPrompt'

const current = vi.hoisted(() => ({ env: null as DeviceEnv | null }))
vi.mock('~/utils/device', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/device')>()),
  deviceEnv: () => current.env,
}))

const IOS_CHROME_17 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1'
const IOS_CHROME_16_3 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/110.0.5481.83 Mobile/15E148 Safari/604.1'
const IOS_FIREFOX_16_4 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/112.0 Mobile/15E148 Safari/605.1.15'
const IOS_INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0'

/**
 * Runs `check` in a browser without `onbeforeinstallprompt` — happy-dom has
 * it, like Chromium; Firefox and Safari do not.
 */
function withoutInstallEvent(check: () => void) {
  let owner: object | null = window
  while (owner && !Object.prototype.hasOwnProperty.call(owner, 'onbeforeinstallprompt')) {
    owner = Object.getPrototypeOf(owner) as object | null
  }
  const descriptor = owner && Object.getOwnPropertyDescriptor(owner, 'onbeforeinstallprompt')
  if (owner) Reflect.deleteProperty(owner, 'onbeforeinstallprompt')
  try {
    check()
  } finally {
    if (owner && descriptor) Object.defineProperty(owner, 'onbeforeinstallprompt', descriptor)
  }
}

/** A Chromium install event whose dialog ends with `outcome`. */
function promptEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt') as BeforeInstallPromptEvent
  const prompt = vi.fn().mockResolvedValue(undefined)
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) })
  return { event, prompt }
}

describe('install method without an install event', () => {
  it.each([
    ['iOS Safari', UA.iPhoneSafari, 'share'],
    ['Chrome on iOS 17', IOS_CHROME_17, 'share'],
    ['Firefox on iOS 16.4 — the first that can', IOS_FIREFOX_16_4, 'share'],
    ['Chrome on iOS 16.3', IOS_CHROME_16_3, 'safari'],
    ['an in-app browser, however new', IOS_INSTAGRAM, 'safari'],
  ] as const)('%s → %s', (_, userAgent, method) => {
    expect(manualInstallMethod(env({ userAgent }))).toBe(method)
  })

  it('treats an iPad with a Mac user agent as iOS Safari', () => {
    const iPad = env({
      userAgent: UA.iPadDesktopClass,
      maxTouchPoints: 5,
      media: ['(pointer: coarse)'],
    })
    expect(isIOS(iPad)).toBe(true)
    expect(manualInstallMethod(iPad)).toBe('share')
  })

  it('sends no Android browser to a manual way — Firefox could only make a shortcut', () => {
    expect(manualInstallMethod(env({ userAgent: UA.androidFirefox }))).toBeNull()
  })

  it('leaves Chromium to its install event', () => {
    expect(manualInstallMethod(env({ userAgent: UA.androidChrome }))).toBeNull()
  })

  it('reads the iOS version from either kind of user agent', () => {
    expect(iosVersion(env({ userAgent: UA.iPhoneSafari }))).toBe(1705)
    expect(iosVersion(env({ userAgent: UA.iPadDesktopClass }))).toBe(1705)
    expect(iosVersion(env({ userAgent: 'Mozilla/5.0 (iPhone) CriOS/1.0' }))).toBeNull()
  })

  it('takes an iOS browser of unknown version for an old one', () => {
    expect(manualInstallMethod(env({ userAgent: 'Mozilla/5.0 (iPhone) CriOS/1.0' }))).toBe('safari')
  })
})

describe('useInstallHint', () => {
  beforeEach(() => {
    localStorage.clear()
    installPrompt.value = null
    appInstalled.value = false
    installRequested.value = false
    current.env = env({ userAgent: UA.iPhoneSafari })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the share-sheet instruction on iOS', () => {
    expect(useInstallHint().method.value).toBe('share')
  })

  it('offers the install button as soon as Chromium hands over its event', () => {
    current.env = env({ userAgent: UA.androidChrome })
    const { method } = useInstallHint()
    // Chromium: nothing until the browser says the app can be installed…
    expect(method.value).toBeNull()
    installPrompt.value = promptEvent('accepted').event
    // …then the button.
    expect(method.value).toBe('prompt')
  })

  it("names Chrome's own menu when asked for without an install event", () => {
    // Chrome sends no event when the app is already installed or not yet
    // ready; its menu entry "App installieren" is a real install all the same.
    current.env = env({ userAgent: UA.androidChrome })
    const { method } = useInstallHint()
    expect(method.value).toBeNull()
    installRequested.value = true
    expect(method.value).toBe('menu')
  })

  it('offers nothing in a browser that could only make a shortcut', () => {
    current.env = env({ userAgent: UA.androidFirefox })
    withoutInstallEvent(() => {
      expect(useInstallHint().method.value).toBeNull()
    })
  })

  it('opens the install dialog once and hides after an install', async () => {
    const { event, prompt } = promptEvent('accepted')
    installPrompt.value = event
    const { method, install } = useInstallHint()
    await install()
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(installPrompt.value).toBeNull()
    expect(appInstalled.value).toBe(true)
    expect(method.value).toBeNull()
  })

  it('drops the used-up event when the dialog was declined', async () => {
    current.env = env({ userAgent: UA.androidChrome })
    const { event } = promptEvent('dismissed')
    installPrompt.value = event
    const { method, install } = useInstallHint()
    await install()
    expect(appInstalled.value).toBe(false)
    // An event works once; the button returns when Chromium sends a new one.
    expect(method.value).toBeNull()
  })

  it('does nothing when asked to install without an event', async () => {
    await expect(useInstallHint().install()).resolves.toBeUndefined()
    expect(appInstalled.value).toBe(false)
  })

  it('rests after a dismissal, and offers itself again after the pause', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_000)
    const first = useInstallHint()
    first.dismiss()
    expect(first.method.value).toBeNull()
    expect(readDismissal()).toStrictEqual({ count: 1, until: 1_000 + INSTALL_HINT_PAUSE_MS })
    expect(useInstallHint().method.value).toBeNull()

    vi.setSystemTime(1_000 + INSTALL_HINT_PAUSE_MS)
    expect(useInstallHint().method.value).toBe('share')
    vi.useRealTimers()
  })

  it('stops offering itself after the third dismissal', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    for (let offer = 1; offer <= INSTALL_HINT_MAX_OFFERS; offer++) {
      vi.setSystemTime(offer * 2 * INSTALL_HINT_PAUSE_MS)
      const hint = useInstallHint()
      expect(hint.method.value).toBe('share')
      hint.dismiss()
    }
    vi.setSystemTime(100 * INSTALL_HINT_PAUSE_MS)
    expect(useInstallHint().method.value).toBeNull()
    vi.useRealTimers()
  })

  it('tells when it may offer itself', () => {
    expect(mayOffer({ count: 0, until: 0 }, 0)).toBe(true)
    expect(mayOffer({ count: 1, until: 10 }, 9)).toBe(false)
    expect(mayOffer({ count: 2, until: 10 }, 10)).toBe(true)
    expect(mayOffer({ count: INSTALL_HINT_MAX_OFFERS, until: 0 }, 99)).toBe(false)
  })

  it.each([
    ['nothing stored', null],
    ['an old flag', '1'],
    ['garbage', '{'],
    ['the wrong shape', JSON.stringify({ count: '2' })],
  ])('reads %s as never dismissed', (_label, raw) => {
    if (raw !== null) localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, raw)
    expect(readDismissal()).toStrictEqual({ count: 0, until: 0 })
  })

  it('shows when asked for, however often it was dismissed', () => {
    localStorage.setItem(
      INSTALL_HINT_DISMISSED_KEY,
      JSON.stringify({ count: INSTALL_HINT_MAX_OFFERS, until: 0 }),
    )
    const { method, dismiss } = useInstallHint()
    expect(method.value).toBeNull()
    installRequested.value = true
    expect(method.value).toBe('share')

    // Closing what was asked for is no dismissal of an offer.
    dismiss()
    expect(method.value).toBeNull()
    expect(readDismissal().count).toBe(INSTALL_HINT_MAX_OFFERS)
  })

  it('counts closing an offer that was also asked for once', () => {
    const { dismiss } = useInstallHint()
    installRequested.value = true
    dismiss()
    expect(installRequested.value).toBe(false)
    expect(readDismissal().count).toBe(1)
  })

  it('shows the hint when storage cannot be read', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(useInstallHint().method.value).toBe('share')
  })

  it('still hides the hint for this visit when storage cannot be written', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'QuotaExceededError')
    })
    const { method, dismiss } = useInstallHint()
    expect(() => {
      dismiss()
    }).not.toThrow()
    expect(method.value).toBeNull()
  })

  it('stays hidden once the app was installed through the browser menu', () => {
    appInstalled.value = true
    expect(useInstallHint().method.value).toBeNull()
  })
})
