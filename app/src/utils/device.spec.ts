import { afterEach, describe, expect, it, vi } from 'vitest'

import { env, UA } from '../../test/helpers/device-env'

import { deviceEnv, isDesktopClassIPad, isMobileDevice, isStandalone, pwaMode } from './device'

describe('isMobileDevice', () => {
  it.each([
    ['iPhone Safari', UA.iPhoneSafari],
    ['Android Chrome without client hints', UA.androidChrome],
    ['Android Firefox', UA.androidFirefox],
  ])('takes %s for a phone', (_, userAgent) => {
    expect(isMobileDevice(env({ userAgent }))).toBe(true)
  })

  it.each([
    ['Windows Chrome', UA.windowsChrome],
    ['macOS Safari', UA.macSafari],
    ['Linux Firefox', UA.linuxFirefox],
  ])('takes %s for a desktop', (_, userAgent) => {
    expect(isMobileDevice(env({ userAgent }))).toBe(false)
  })

  it('recognises an iPad that sends a Mac user agent by its touch screen', () => {
    const iPad = env({
      userAgent: UA.iPadDesktopClass,
      maxTouchPoints: 5,
      media: ['(pointer: coarse)'],
    })
    expect(isMobileDevice(iPad)).toBe(true)
    expect(isDesktopClassIPad(iPad)).toBe(true)
  })

  it('keeps a Mac with a touch-capable pointer device a desktop', () => {
    // Touch points alone are not enough — the primary pointer has to be a finger.
    expect(isMobileDevice(env({ userAgent: UA.macSafari, maxTouchPoints: 5 }))).toBe(false)
  })

  describe('with client hints (Chromium)', () => {
    it('trusts `mobile: true`', () => {
      expect(isMobileDevice(env({ userAgentData: { mobile: true, platform: 'Android' } }))).toBe(
        true,
      )
    })

    it('counts an Android tablet (`mobile: false`) as mobile by its platform', () => {
      expect(isMobileDevice(env({ userAgentData: { mobile: false, platform: 'Android' } }))).toBe(
        true,
      )
      expect(isMobileDevice(env({ userAgentData: { mobile: false, platform: 'iOS' } }))).toBe(true)
    })

    it('trusts a desktop answer over a user agent that says otherwise', () => {
      // Chrome's reduced UA on a desktop can be anything; the hints are the truth.
      const desktop = env({
        userAgent: UA.androidChrome,
        userAgentData: { mobile: false, platform: 'Windows' },
      })
      expect(isMobileDevice(desktop)).toBe(false)
    })

    it('falls back to the user agent when the hints carry no `mobile`', () => {
      expect(isMobileDevice(env({ userAgent: UA.androidChrome, userAgentData: {} }))).toBe(true)
    })
  })
})

describe('isStandalone', () => {
  it('is true when started from the home screen on iOS', () => {
    expect(isStandalone(env({ standalone: true }))).toBe(true)
  })

  it('is true in display-mode standalone', () => {
    expect(isStandalone(env({ media: ['(display-mode: standalone)'] }))).toBe(true)
  })

  it('is false in a browser tab', () => {
    expect(isStandalone(env({ standalone: false }))).toBe(false)
    expect(isStandalone(env())).toBe(false)
  })
})

describe('pwaMode', () => {
  it('is `installed` when running standalone — on any device', () => {
    expect(pwaMode(env({ userAgent: UA.iPhoneSafari, standalone: true }))).toBe('installed')
    expect(pwaMode(env({ media: ['(display-mode: standalone)'] }))).toBe('installed')
  })

  it('is `mobile` in a phone or tablet browser', () => {
    expect(pwaMode(env({ userAgent: UA.androidChrome }))).toBe('mobile')
  })

  it('is `desktop` in a desktop browser', () => {
    expect(pwaMode(env({ userAgent: UA.windowsChrome }))).toBe('desktop')
  })
})

describe('deviceEnv', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads the real navigator and window', () => {
    const matchMedia = vi
      .spyOn(window, 'matchMedia')
      .mockReturnValue({ matches: true } as unknown as MediaQueryList)
    const current = deviceEnv()
    expect(current.userAgent).toBe(navigator.userAgent)
    expect(current.maxTouchPoints).toBe(navigator.maxTouchPoints)
    expect(current.matchMedia('(pointer: coarse)').matches).toBe(true)
    expect(matchMedia).toHaveBeenCalledWith('(pointer: coarse)')
  })
})
