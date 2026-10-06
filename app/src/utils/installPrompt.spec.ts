import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  APP_LAUNCHED_KEY,
  appInstalled,
  installPrompt,
  installRequested,
  listenForInstallPrompt,
  rememberAppLaunch,
  requestInstall,
} from './installPrompt'

describe('listenForInstallPrompt', () => {
  let target: EventTarget

  beforeEach(() => {
    installPrompt.value = null
    appInstalled.value = false
    target = new EventTarget()
    listenForInstallPrompt(target as Window)
  })

  it('keeps the install event and stops the browser from showing its own banner', () => {
    const event = new Event('beforeinstallprompt', { cancelable: true })
    target.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(installPrompt.value).toBe(event)
  })

  it('forgets the event and records the install once the app is installed', () => {
    target.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }))
    target.dispatchEvent(new Event('appinstalled'))
    expect(installPrompt.value).toBeNull()
    expect(appInstalled.value).toBe(true)
  })

  it('listens on window by default', () => {
    const add = vi.spyOn(window, 'addEventListener')
    listenForInstallPrompt()
    expect(add.mock.calls.map(([type]) => type)).toStrictEqual([
      'beforeinstallprompt',
      'appinstalled',
    ])
    add.mockRestore()
  })
})

describe('requestInstall', () => {
  beforeEach(() => {
    installPrompt.value = null
    appInstalled.value = false
    installRequested.value = false
  })

  function promptEvent(outcome: 'accepted' | 'dismissed') {
    const prompt = vi.fn(async () => {})
    installPrompt.value = Object.assign(new Event('beforeinstallprompt'), {
      prompt,
      userChoice: Promise.resolve({ outcome }),
    })
    return prompt
  }

  it("opens Chromium's dialog right away when it offered one", async () => {
    const prompt = promptEvent('accepted')
    await requestInstall()
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(appInstalled.value).toBe(true)
    expect(installRequested.value).toBe(false)
    expect(installPrompt.value).toBeNull()
  })

  it('leaves the app uninstalled when the dialog is declined', async () => {
    promptEvent('dismissed')
    await requestInstall()
    expect(appInstalled.value).toBe(false)
  })

  it('shows the hint with the steps everywhere else', async () => {
    await requestInstall()
    expect(installRequested.value).toBe(true)
  })
})

describe('rememberAppLaunch', () => {
  beforeEach(() => {
    localStorage.clear()
    appInstalled.value = false
  })

  it('knows the app once it was started from the home screen', () => {
    rememberAppLaunch(new URLSearchParams('app'))
    expect(appInstalled.value).toBe(true)
    expect(localStorage.getItem(APP_LAUNCHED_KEY)).toBe('1')

    // Later, in a browser tab on the same device: still known.
    appInstalled.value = false
    rememberAppLaunch(new URLSearchParams(''))
    expect(appInstalled.value).toBe(true)
  })

  it('knows nothing of an app never started', () => {
    rememberAppLaunch(new URLSearchParams('month=10'))
    expect(appInstalled.value).toBe(false)
  })

  it('still counts this start when storage is blocked', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    vi.spyOn(localStorage, 'setItem').mockImplementation(blocked)
    rememberAppLaunch(new URLSearchParams('app'))
    expect(appInstalled.value).toBe(true)

    appInstalled.value = false
    rememberAppLaunch(new URLSearchParams(''))
    expect(appInstalled.value).toBe(false)
    vi.restoreAllMocks()
  })
})
