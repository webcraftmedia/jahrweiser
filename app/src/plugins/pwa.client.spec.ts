import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { env, UA } from '../../test/helpers/device-env'
import { installHintEligible } from '../utils/installPrompt'

import plugin, { MANIFEST_URL, expireOfflineCopy } from './pwa.client'

import type { DeviceEnv } from '../utils/device'

const mocks = vi.hoisted(() => ({
  env: null as DeviceEnv | null,
  useHead: vi.fn(),
  listen: vi.fn(),
  register: vi.fn(),
}))

mockNuxtImport('useHead', () => mocks.useHead)

vi.mock('~/utils/device', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/device')>()),
  deviceEnv: () => mocks.env,
}))

vi.mock('~/utils/installPrompt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/installPrompt')>()),
  listenForInstallPrompt: mocks.listen,
}))

vi.mock('~/utils/serviceWorker', () => ({ registerServiceWorker: mocks.register }))

const offline = vi.hoisted(() => ({
  enabled: false,
  session: null as { uid: string; deadline: number } | null,
  purge: vi.fn(),
}))
vi.mock('~/utils/offlineSession', () => ({
  enableOfflineSession: () => {
    offline.enabled = true
  },
  offlineSessionEnabled: () => offline.enabled,
  readOfflineSession: () => offline.session,
  offlineSessionValid: (uid: string, now: number) =>
    offline.session?.uid === uid && offline.session.deadline > now,
  purgeOfflineData: offline.purge,
}))

function offlineSessionEnabled() {
  return offline.enabled
}

/** Runs the plugin with a Nuxt app that records its hooks. */
async function run(device: DeviceEnv) {
  mocks.env = device
  const hooks: Record<string, () => void> = {}
  const nuxtApp = {
    hook: vi.fn((name: string, fn: () => void) => {
      hooks[name] = fn
    }),
  }
  ;(plugin as unknown as (app: typeof nuxtApp) => void)(nuxtApp)
  // Let the lazy import of the registration code settle.
  await vi.dynamicImportSettled()
  return { hooks }
}

const MANIFEST_LINK = { link: [{ rel: 'manifest', href: MANIFEST_URL }] }

describe('pwa plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installHintEligible.value = false
    useRuntimeConfig().public.serviceWorker = true
  })

  it('gives a desktop browser nothing: no manifest, no worker, no hint', async () => {
    const { hooks } = await run(env({ userAgent: UA.windowsChrome }))
    expect(mocks.useHead).not.toHaveBeenCalled()
    expect(mocks.register).not.toHaveBeenCalled()
    expect(mocks.listen).not.toHaveBeenCalled()
    expect(hooks).toStrictEqual({})
  })

  it('gives a phone browser the manifest and the hint, but no worker', async () => {
    const { hooks } = await run(env({ userAgent: UA.androidChrome }))
    expect(mocks.useHead).toHaveBeenCalledWith(MANIFEST_LINK)
    expect(mocks.listen).toHaveBeenCalledTimes(1)
    expect(mocks.register).not.toHaveBeenCalled()
    // Only after mount, so server and client render agree on "no hint".
    expect(installHintEligible.value).toBe(false)
    hooks['app:mounted']!()
    expect(installHintEligible.value).toBe(true)
  })

  it('gives the installed app the manifest and the worker, and no hint', async () => {
    const { hooks } = await run(env({ userAgent: UA.iPhoneSafari, standalone: true }))
    expect(mocks.useHead).toHaveBeenCalledWith(MANIFEST_LINK)
    // Enabled everywhere but in development, where no worker is built.
    expect(mocks.register).toHaveBeenCalledWith(!import.meta.dev)
    expect(mocks.listen).not.toHaveBeenCalled()
    // Its one hook checks the offline copy; the install hint stays off.
    expect(Object.keys(hooks)).toStrictEqual(['app:mounted'])
    expect(offlineSessionEnabled()).toBe(true)
    hooks['app:mounted']!()
    expect(installHintEligible.value).toBe(false)
  })

  it('registers no worker while the kill switch is on', async () => {
    // A self-destroying worker reloads the app; registering it again would loop.
    useRuntimeConfig().public.serviceWorker = false
    await run(env({ standalone: true }))
    expect(mocks.register).toHaveBeenCalledWith(false)
  })

  it('carries on when the registration code cannot be loaded', async () => {
    mocks.register.mockImplementationOnce(() => {
      throw new Error('chunk failed')
    })
    await expect(run(env({ media: ['(display-mode: standalone)'] }))).resolves.toBeDefined()
    expect(mocks.register).toHaveBeenCalledTimes(1)
  })

  describe('the offline copy at start-up', () => {
    const replace = vi.fn()

    beforeEach(() => {
      offline.session = { uid: 'u1', deadline: 1000 }
      Object.defineProperty(window, 'location', { value: { replace }, writable: true })
    })

    function online(value: boolean) {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
    }

    it('is cleared and the login shown when offline past the deadline', async () => {
      online(false)
      await expireOfflineCopy(1000)
      expect(offline.purge).toHaveBeenCalledTimes(1)
      expect(replace).toHaveBeenCalledWith('/login')
    })

    it('still leaves for the login when clearing fails', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      offline.purge.mockRejectedValueOnce(new Error('blocked'))
      online(false)
      await expireOfflineCopy(1000)
      expect(replace).toHaveBeenCalledWith('/login')
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    })

    it('stays while the deadline lies ahead', async () => {
      online(false)
      await expireOfflineCopy(999)
      expect(offline.purge).not.toHaveBeenCalled()
    })

    it('is left to the server while online', async () => {
      online(true)
      await expireOfflineCopy(5000)
      expect(offline.purge).not.toHaveBeenCalled()
    })

    it('needs nothing when there is no copy', async () => {
      offline.session = null
      online(false)
      await expireOfflineCopy(5000)
      expect(offline.purge).not.toHaveBeenCalled()
    })
  })
})
