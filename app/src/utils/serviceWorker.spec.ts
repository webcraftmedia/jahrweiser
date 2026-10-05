import { describe, expect, it, vi } from 'vitest'

import { registerServiceWorker, SERVICE_WORKER_URL } from './serviceWorker'

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
