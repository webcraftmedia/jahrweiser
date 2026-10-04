import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { env, UA } from '../../test/helpers/device-env'
import { appInstalled, installPrompt } from '../utils/installPrompt'

import {
  INSTALL_HINT_DISMISSED_KEY,
  iosVersion,
  isIOS,
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
    expect(manualInstallMethod(env({ userAgent }), false)).toBe(method)
  })

  it('treats an iPad with a Mac user agent as iOS Safari', () => {
    const iPad = env({
      userAgent: UA.iPadDesktopClass,
      maxTouchPoints: 5,
      media: ['(pointer: coarse)'],
    })
    expect(isIOS(iPad)).toBe(true)
    expect(manualInstallMethod(iPad, false)).toBe('share')
  })

  it('points other Android browsers (no install event) to their menu', () => {
    expect(manualInstallMethod(env({ userAgent: UA.androidFirefox }), false)).toBe('menu')
  })

  it('leaves Chromium to its install event', () => {
    expect(manualInstallMethod(env({ userAgent: UA.androidChrome }), true)).toBeNull()
  })

  it('reads the iOS version from either kind of user agent', () => {
    expect(iosVersion(env({ userAgent: UA.iPhoneSafari }))).toBe(1705)
    expect(iosVersion(env({ userAgent: UA.iPadDesktopClass }))).toBe(1705)
    expect(iosVersion(env({ userAgent: 'Mozilla/5.0 (iPhone) CriOS/1.0' }))).toBeNull()
  })

  it('takes an iOS browser of unknown version for an old one', () => {
    expect(manualInstallMethod(env({ userAgent: 'Mozilla/5.0 (iPhone) CriOS/1.0' }), false)).toBe(
      'safari',
    )
  })
})

describe('useInstallHint', () => {
  beforeEach(() => {
    localStorage.clear()
    installPrompt.value = null
    appInstalled.value = false
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

  it('points to the browser menu where there is no install event (Firefox)', () => {
    current.env = env({ userAgent: UA.androidFirefox })
    withoutInstallEvent(() => {
      expect(useInstallHint().method.value).toBe('menu')
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

  it('remembers a dismissal on this device', () => {
    const first = useInstallHint()
    first.dismiss()
    expect(first.method.value).toBeNull()
    expect(localStorage.getItem(INSTALL_HINT_DISMISSED_KEY)).toBe('1')
    expect(useInstallHint().method.value).toBeNull()
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
