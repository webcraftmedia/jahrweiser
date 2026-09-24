import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { TimeoutError, withTimeout } from './withTimeout'

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('passes the value through when the call settles in time', async () => {
    const promise = withTimeout(1000, () => Promise.resolve('done'))
    await expect(promise).resolves.toBe('done')
  })

  it('passes a rejection through unchanged', async () => {
    const boom = new Error('boom')
    await expect(withTimeout(1000, () => Promise.reject(boom))).rejects.toBe(boom)
  })

  it('rejects with a TimeoutError once the deadline passes', async () => {
    // The case the helper exists for: a promise that never settles. Without the
    // deadline the caller's loading state would be permanent. The handler is
    // attached before the clock moves, so nothing is ever an unhandled
    // rejection.
    const settled = withTimeout(1000, () => new Promise<string>(() => {})).catch(
      (error: unknown) => error,
    )
    await vi.advanceTimersByTimeAsync(1000)
    await expect(settled).resolves.toBeInstanceOf(TimeoutError)
  })

  it('aborts the signal it handed out when the deadline passes', async () => {
    // Rejecting alone would leave the request running: the browser keeps the
    // connection and the response lands in a handler nobody waits for.
    let signal: AbortSignal | undefined
    const settled = withTimeout(1000, (s) => {
      signal = s
      return new Promise<string>(() => {})
    }).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(settled).resolves.toBeInstanceOf(TimeoutError)
    expect(signal!.aborted).toBe(true)
  })

  it('does not abort a call that came back in time', async () => {
    let signal: AbortSignal | undefined
    await withTimeout(1000, (s) => {
      signal = s
      return Promise.resolve('done')
    })
    await vi.advanceTimersByTimeAsync(5000)
    expect(signal!.aborted).toBe(false)
  })
})
