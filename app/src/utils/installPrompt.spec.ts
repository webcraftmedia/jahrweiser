import { beforeEach, describe, expect, it, vi } from 'vitest'

import { appInstalled, installPrompt, listenForInstallPrompt } from './installPrompt'

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
