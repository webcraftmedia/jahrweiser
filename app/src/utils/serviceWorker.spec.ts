import { describe, expect, it, vi } from 'vitest'

import {
  keepStartPages,
  registerServiceWorker,
  SERVICE_WORKER_URL,
  START_PAGES,
} from './serviceWorker'

/** A window just big enough for the registration code. */
function fakeWindow({
  supported = true,
  readyState = 'complete',
  register = vi.fn().mockResolvedValue({}),
}: { supported?: boolean; readyState?: string; register?: ReturnType<typeof vi.fn> } = {}) {
  const listeners: Record<string, () => void> = {}
  const win = {
    navigator: supported ? { serviceWorker: { register } } : {},
    document: { readyState },
    addEventListener: vi.fn((type: string, listener: () => void) => {
      listeners[type] = listener
    }),
  }
  return { win: win as unknown as Window, register, listeners }
}

describe('registerServiceWorker', () => {
  it('registers the generated worker for the whole origin', () => {
    const { win, register } = fakeWindow()
    registerServiceWorker(true, win)
    expect(register).toHaveBeenCalledWith(SERVICE_WORKER_URL, { scope: '/' })
    expect(SERVICE_WORKER_URL).toBe('/sw.js')
  })

  it('waits for the page to finish loading first', () => {
    const { win, register, listeners } = fakeWindow({ readyState: 'interactive' })
    registerServiceWorker(true, win)
    expect(register).not.toHaveBeenCalled()
    expect(win.addEventListener).toHaveBeenCalledWith('load', expect.any(Function), { once: true })
    listeners.load!()
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('does nothing in browsers without service workers', () => {
    const { win } = fakeWindow({ supported: false })
    expect(() => {
      registerServiceWorker(true, win)
    }).not.toThrow()
    expect(win.addEventListener).not.toHaveBeenCalled()
  })

  it('does nothing when disabled (development)', () => {
    const { win, register } = fakeWindow()
    registerServiceWorker(false, win)
    expect(register).not.toHaveBeenCalled()
  })

  it('swallows a failed registration — the app works without a worker', async () => {
    const register = vi.fn().mockRejectedValue(new DOMException('denied', 'SecurityError'))
    const { win } = fakeWindow({ register })
    registerServiceWorker(true, win)
    expect(register).toHaveBeenCalledTimes(1)
    // An unhandled rejection would fail the run; letting it settle is the assertion.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it('uses the real window by default', () => {
    // happy-dom has no service workers: the call must be a silent no-op.
    expect('serviceWorker' in navigator).toBe(false)
    expect(() => {
      registerServiceWorker(true)
    }).not.toThrow()
  })
})

describe('keepStartPages', () => {
  function page(status = 200, redirected = false) {
    return { ok: status >= 200 && status < 300, status, redirected } as Response
  }

  function cacheWindow({
    online = true,
    withCaches = true,
    fetch = vi.fn(async () => page()),
  }: { online?: boolean; withCaches?: boolean; fetch?: ReturnType<typeof vi.fn> } = {}) {
    const cache = { put: vi.fn(async () => {}) }
    const open = vi.fn(async () => cache)
    const win = {
      navigator: { onLine: online },
      fetch,
      ...(withCaches ? { caches: { open } } : {}),
    }
    return { win: win as unknown as Window, cache, open, fetch }
  }

  it("keeps each start page once, in the worker's page cache, with the cookie", async () => {
    const { win, cache, open, fetch } = cacheWindow()
    await keepStartPages(['/?app', '/', '/?app'], win)
    expect(open).toHaveBeenCalledWith('jahrweiser-pages')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledWith('/', { credentials: 'same-origin' })
    expect(cache.put.mock.calls.map(([url]) => url)).toStrictEqual(['/?app', '/'])
  })

  it('keeps no redirect and no error — logged out, that is the login page', async () => {
    const fetch = vi.fn(async (url: string) => (url === '/' ? page(200, true) : page(500)))
    const { win, cache } = cacheWindow({ fetch })
    await keepStartPages(['/', '/?app'], win)
    expect(cache.put).not.toHaveBeenCalled()
  })

  it('carries on past a page that cannot be fetched', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url === '/') throw new TypeError('network')
      return page()
    })
    const { win, cache } = cacheWindow({ fetch })
    await expect(keepStartPages(['/', '/?app'], win)).resolves.toBeUndefined()
    expect(cache.put).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['offline', { online: false }],
    ['without a Cache API', { withCaches: false }],
  ])('does nothing %s', async (_label, options) => {
    const { win, fetch } = cacheWindow(options)
    await keepStartPages(['/'], win)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('names the start_url and the plain root', () => {
    expect(START_PAGES).toStrictEqual(['/?app', '/'])
  })
})
