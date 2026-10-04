// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const setResponseHeader = vi.hoisted(() => vi.fn())
vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
vi.stubGlobal('setResponseHeader', setResponseHeader)

type RequestHook = (event: { path: string }) => void

/** Runs the plugin against a Nitro app and returns its `request` hook. */
async function requestHook(): Promise<RequestHook> {
  const { default: plugin } = await import('./pwa-headers')
  let hook: RequestHook | undefined
  const nitroApp = {
    hooks: {
      hook: (name: string, fn: RequestHook) => {
        if (name === 'request') hook = fn
      },
    },
  }
  ;(plugin as unknown as (app: typeof nitroApp) => void)(nitroApp)
  return hook!
}

describe('pwa-headers plugin', () => {
  it('marks the service worker as no-cache before the static handler serves it', async () => {
    const hook = await requestHook()
    const event = { path: '/sw.js' }
    hook(event)
    expect(setResponseHeader).toHaveBeenCalledWith(event, 'cache-control', 'no-cache')
  })

  it('leaves every other response alone', async () => {
    setResponseHeader.mockClear()
    const hook = await requestHook()
    hook({ path: '/_nuxt/entry.js' })
    expect(setResponseHeader).not.toHaveBeenCalled()
  })
})
