// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { DB_TIMEOUT_MS, withDbTimeout } from './dbTimeout'

describe('withDbTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('passes the query result through', async () => {
    await expect(withDbTimeout(Promise.resolve([{ id: 1 }]))).resolves.toStrictEqual([{ id: 1 }])
  })

  it('passes a query error through unchanged', async () => {
    const boom = new Error('ER_ACCESS_DENIED')
    await expect(withDbTimeout(Promise.reject(boom))).rejects.toBe(boom)
  })

  it('throws 503 when the query outlasts the deadline', async () => {
    // mysql2 queues indefinitely when the pool is exhausted, so this is not a
    // hypothetical: without the deadline the HTTP request never answers.
    const settled = withDbTimeout(new Promise(() => {})).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(DB_TIMEOUT_MS)
    await expect(settled).resolves.toMatchObject({ statusCode: 503 })
  })

  it('accepts a shorter deadline', async () => {
    const settled = withDbTimeout(new Promise(() => {}), 100).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(100)
    await expect(settled).resolves.toMatchObject({ statusCode: 503 })
  })

  it('clears its timer when the query wins', async () => {
    // Otherwise every query would hold a pending timer for the full deadline,
    // and the session-check middleware runs one on every request.
    const clear = vi.spyOn(globalThis, 'clearTimeout')
    await withDbTimeout(Promise.resolve('ok'))
    expect(clear).toHaveBeenCalled()
    clear.mockRestore()
  })
})
