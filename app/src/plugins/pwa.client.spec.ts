import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { env, UA } from '../../test/helpers/device-env'
import { installHintEligible } from '../utils/installPrompt'

import plugin, { MANIFEST_URL } from './pwa.client'

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
    expect(hooks).toStrictEqual({})
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
})
