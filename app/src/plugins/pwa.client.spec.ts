import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { env, UA } from '../../test/helpers/device-env'
import { installHintEligible, installUnsupported } from '../utils/installPrompt'
import { pwaHeadLinks } from '../utils/pwaHead'

import plugin, {
  checkOfflineCopy,
  keepStartPagesWhenReady,
  launchedAddress,
  openLaunchedAddress,
} from './pwa.client'

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

const keep = vi.hoisted(() => vi.fn())
const keepMessages = vi.hoisted(() => vi.fn())
vi.mock('~/utils/serviceWorker', () => ({
  registerServiceWorker: mocks.register,
  START_PAGES: ['/?app', '/'],
  keepStartPages: keep,
  keepMessages,
}))

const session = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ref } = require('vue')
  return { loggedIn: ref(false) }
})
mockNuxtImport('useUserSession', () => () => session)

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

const mockPrune = vi.hoisted(() => vi.fn())
vi.mock('~/utils/offlineData', () => ({ pruneOfflineData: mockPrune }))

function offlineSessionEnabled() {
  return offline.enabled
}

/** Runs the plugin with a Nuxt app that records its hooks. */
async function run(device: DeviceEnv) {
  mocks.env = device
  const hooks: Record<string, () => void> = {}
  const nuxtApp = {
    hook: vi.fn((name: string, fn: () => void) => {
      // Several plugins' worth of hooks under one name run in order.
      const before = hooks[name]
      hooks[name] = before
        ? () => {
            before()
            fn()
          }
        : fn
    }),
  }
  ;(plugin as unknown as (app: typeof nuxtApp) => void)(nuxtApp)
  // Let the lazy import of the registration code settle.
  await vi.dynamicImportSettled()
  return { hooks }
}

const MANIFEST_LINK = { link: pwaHeadLinks() }

describe('pwa plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installHintEligible.value = false
    installUnsupported.value = false
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

  it('offers no installation where the browser could only make a shortcut', async () => {
    // Firefox on Android: no install event, not iOS.
    let owner: object | null = window
    while (owner && !Object.prototype.hasOwnProperty.call(owner, 'onbeforeinstallprompt')) {
      owner = Object.getPrototypeOf(owner) as object | null
    }
    const descriptor = owner && Object.getOwnPropertyDescriptor(owner, 'onbeforeinstallprompt')
    if (owner) Reflect.deleteProperty(owner, 'onbeforeinstallprompt')
    try {
      const { hooks } = await run(env({ userAgent: UA.androidFirefox }))
      // The manifest still: a later Firefox may install for real.
      expect(mocks.useHead).toHaveBeenCalledWith(MANIFEST_LINK)
      hooks['app:mounted']!()
      expect(installHintEligible.value).toBe(false)
      expect(installUnsupported.value).toBe(true)
    } finally {
      if (owner && descriptor) Object.defineProperty(owner, 'onbeforeinstallprompt', descriptor)
    }
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
      await checkOfflineCopy(1000)
      expect(offline.purge).toHaveBeenCalledTimes(1)
      expect(mockPrune).not.toHaveBeenCalled()
      expect(replace).toHaveBeenCalledWith('/login')
    })

    it('still leaves for the login when clearing fails', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      offline.purge.mockRejectedValueOnce(new Error('blocked'))
      online(false)
      await checkOfflineCopy(1000)
      expect(replace).toHaveBeenCalledWith('/login')
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    })

    it('stays while the deadline lies ahead, minus what is out of reach', async () => {
      online(false)
      await checkOfflineCopy(999)
      expect(offline.purge).not.toHaveBeenCalled()
      expect(mockPrune).toHaveBeenCalledWith(999)
    })

    it('is left to the server while online, and tidied all the same', async () => {
      online(true)
      await checkOfflineCopy(5000)
      expect(offline.purge).not.toHaveBeenCalled()
      expect(mockPrune).toHaveBeenCalledWith(5000)
    })

    it('starts even when tidying fails', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockPrune.mockRejectedValueOnce(new Error('blocked'))
      online(true)
      await expect(checkOfflineCopy(5000)).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    })

    it('needs nothing when there is no copy', async () => {
      offline.session = null
      online(false)
      await checkOfflineCopy(5000)
      expect(offline.purge).not.toHaveBeenCalled()
      expect(mockPrune).not.toHaveBeenCalled()
    })
  })

  describe('the start pages for an offline start', () => {
    beforeEach(() => {
      session.loggedIn.value = false
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { ready: Promise.resolve({}) },
        configurable: true,
      })
    })

    afterEach(() => {
      Reflect.deleteProperty(navigator, 'serviceWorker')
    })

    it('are kept once a member is logged in — right after the login, too', async () => {
      const { hooks } = await run(env({ userAgent: UA.iPhoneSafari, standalone: true }))
      hooks['app:mounted']!()
      await vi.dynamicImportSettled()
      // The first start of the app usually is the login: nothing to keep yet.
      expect(keep).not.toHaveBeenCalled()

      session.loggedIn.value = true
      await vi.waitFor(() => {
        expect(keep).toHaveBeenCalledWith(['/?app', '/'])
      })
    })

    it('are kept straight away on a start that is logged in already', async () => {
      session.loggedIn.value = true
      const { hooks } = await run(env({ userAgent: UA.iPhoneSafari, standalone: true }))
      hooks['app:mounted']!()
      await vi.waitFor(() => {
        expect(keep).toHaveBeenCalledTimes(1)
      })
    })

    it('failing to keep them leaves the app as it is', async () => {
      // Quota full, storage blocked: an offline start then shows the notice,
      // nothing more — and no unhandled rejection.
      keep.mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'))
      session.loggedIn.value = true
      const { hooks } = await run(env({ userAgent: UA.iPhoneSafari, standalone: true }))
      expect(() => {
        hooks['app:mounted']!()
      }).not.toThrow()
      await vi.waitFor(() => {
        expect(keep).toHaveBeenCalledTimes(1)
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    it('are not kept while the kill switch is on', async () => {
      useRuntimeConfig().public.serviceWorker = false
      session.loggedIn.value = true
      const { hooks } = await run(env({ standalone: true }))
      hooks['app:mounted']!()
      await vi.dynamicImportSettled()
      expect(keep).not.toHaveBeenCalled()
    })

    it('wait for the worker before anything is kept', async () => {
      let ready!: () => void
      Object.defineProperty(navigator, 'serviceWorker', {
        value: {
          ready: new Promise<void>((resolve) => {
            ready = resolve
          }),
        },
        configurable: true,
      })
      const done = keepStartPagesWhenReady()
      await vi.dynamicImportSettled()
      expect(keep).not.toHaveBeenCalled()
      ready()
      await done
      expect(keep).toHaveBeenCalledWith(['/?app', '/'])
      // The translations go along: without them an offline start shows raw keys.
      expect(keepMessages).toHaveBeenCalledTimes(1)
    })
  })

  describe('the address the start asked for', () => {
    function navigatedTo(url: string | null) {
      vi.spyOn(performance, 'getEntriesByType').mockReturnValue(
        url ? [{ name: url } as PerformanceEntry] : [],
      )
    }

    function routerAt(fullPath: string) {
      return { currentRoute: { value: { fullPath } }, replace: vi.fn(async () => {}) }
    }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('reads it from the navigation entry, path and query', () => {
      navigatedTo('https://gg-g.info/2026/11?app')
      expect(launchedAddress()).toBe('/2026/11?app')
      navigatedTo(null)
      expect(launchedAddress()).toBeNull()
    })

    it('opens the calendar address an offline start was answered with the start page for', () => {
      // The worker served the stored /?app page for /2026/11; Nuxt hydrated on /?app.
      navigatedTo('https://gg-g.info/2026/11')
      const router = routerAt('/?app')
      openLaunchedAddress(router as never)
      expect(router.replace).toHaveBeenCalledWith('/2026/11')
    })

    it.each([
      [
        'the route already is the address — any online start',
        'https://gg-g.info/2026/11',
        '/2026/11',
      ],
      ['the address is no calendar page', 'https://gg-g.info/karte', '/'],
      ['there is no navigation entry', null, '/'],
    ])('does nothing when %s', (_label, url, route) => {
      navigatedTo(url)
      const router = routerAt(route)
      openLaunchedAddress(router as never)
      expect(router.replace).not.toHaveBeenCalled()
    })
  })
})
