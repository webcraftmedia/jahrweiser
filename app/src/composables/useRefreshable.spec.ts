import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  RESUME_REFRESH_AFTER_MS,
  refreshAll,
  useRefreshable,
  useRefreshing,
} from './useRefreshable'

/** What `document.visibilityState` answers — happy-dom has no setter for it. */
let visibility: DocumentVisibilityState = 'visible'

function setVisibility(state: DocumentVisibilityState): void {
  visibility = state
  document.dispatchEvent(new Event('visibilitychange'))
}

function pageShow(persisted: boolean): void {
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted }))
}

const mounted: { unmount: () => void }[] = []

/** Mounts a component whose only job is to register `refresh`. */
async function mountWith(refresh: () => void | Promise<void>) {
  const wrapper = await mountSuspended(
    defineComponent({
      setup() {
        useRefreshable(refresh)
        return () => h('div')
      },
    }),
  )
  mounted.push(wrapper)
  return wrapper
}

describe('useRefreshable: coming back', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-04T08:00:00Z'))
    visibility = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  })

  afterEach(() => {
    // The registry is app-wide; what a test mounted must not answer in the next.
    for (const wrapper of mounted.splice(0)) wrapper.unmount()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('refreshes when the app comes back after the threshold', async () => {
    const refresh = vi.fn()
    await mountWith(refresh)
    setVisibility('hidden')
    vi.advanceTimersByTime(RESUME_REFRESH_AFTER_MS)
    setVisibility('visible')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('leaves a short switch to another app alone', async () => {
    const refresh = vi.fn()
    await mountWith(refresh)
    setVisibility('hidden')
    vi.advanceTimersByTime(RESUME_REFRESH_AFTER_MS - 1)
    setVisibility('visible')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('does nothing on a visible event without having been away', async () => {
    const refresh = vi.fn()
    await mountWith(refresh)
    vi.advanceTimersByTime(RESUME_REFRESH_AFTER_MS * 2)
    setVisibility('visible')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('counts from the first time the app was left, not the last', async () => {
    const refresh = vi.fn()
    await mountWith(refresh)
    setVisibility('hidden')
    vi.advanceTimersByTime(RESUME_REFRESH_AFTER_MS - 1000)
    // A pagehide on top of the hidden tab must not restart the clock.
    window.dispatchEvent(new Event('pagehide'))
    vi.advanceTimersByTime(1000)
    setVisibility('visible')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes a page restored from the back/forward cache', async () => {
    const refresh = vi.fn()
    await mountWith(refresh)
    window.dispatchEvent(new Event('pagehide'))
    vi.advanceTimersByTime(RESUME_REFRESH_AFTER_MS)
    pageShow(true)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('ignores an ordinary pageshow — that is a fresh load, not a return', async () => {
    const refresh = vi.fn()
    await mountWith(refresh)
    window.dispatchEvent(new Event('pagehide'))
    vi.advanceTimersByTime(RESUME_REFRESH_AFTER_MS)
    pageShow(false)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('refreshes once when both events report the same return', async () => {
    const refresh = vi.fn()
    await mountWith(refresh)
    setVisibility('hidden')
    window.dispatchEvent(new Event('pagehide'))
    vi.advanceTimersByTime(RESUME_REFRESH_AFTER_MS)
    pageShow(true)
    setVisibility('visible')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('does not start a second refresh while the first is still waiting', async () => {
    let finish!: () => void
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    await mountWith(refresh)

    setVisibility('hidden')
    vi.advanceTimersByTime(RESUME_REFRESH_AFTER_MS)
    setVisibility('visible')
    setVisibility('hidden')
    vi.advanceTimersByTime(RESUME_REFRESH_AFTER_MS)
    setVisibility('visible')
    expect(refresh).toHaveBeenCalledTimes(1)

    // Once it has answered, the next return refreshes again.
    finish()
    await flushPromises()
    setVisibility('hidden')
    vi.advanceTimersByTime(RESUME_REFRESH_AFTER_MS)
    setVisibility('visible')
    expect(refresh).toHaveBeenCalledTimes(2)
    finish()
    await flushPromises()
  })

  it('stops listening once the component is gone', async () => {
    const refresh = vi.fn()
    const wrapper = await mountWith(refresh)
    wrapper.unmount()
    setVisibility('hidden')
    window.dispatchEvent(new Event('pagehide'))
    vi.advanceTimersByTime(RESUME_REFRESH_AFTER_MS)
    setVisibility('visible')
    pageShow(true)
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('useRefreshable: refreshing by hand', () => {
  afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount()
    vi.restoreAllMocks()
  })

  it('runs everything mounted, no threshold, and says so while it runs', async () => {
    let finish!: () => void
    const slow = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const quick = vi.fn()
    await mountWith(slow)
    await mountWith(quick)

    const run = refreshAll()
    expect(useRefreshing().value).toBe(true)
    expect(slow).toHaveBeenCalledTimes(1)
    expect(quick).toHaveBeenCalledTimes(1)

    // A second tap joins the running refresh instead of starting another.
    const again = refreshAll()
    expect(slow).toHaveBeenCalledTimes(1)

    finish()
    await Promise.all([run, again])
    expect(useRefreshing().value).toBe(false)
  })

  it('keeps going when one part fails, and lets nothing escape', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const other = vi.fn()
    await mountWith(() => {
      throw new Error('map down')
    })
    await mountWith(async () => Promise.reject(new Error('list down')))
    await mountWith(other)

    await expect(refreshAll()).resolves.toBeUndefined()
    expect(other).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(2)
    expect(useRefreshing().value).toBe(false)
  })

  it('stops waiting for a request that never answers', async () => {
    vi.useFakeTimers()
    await mountWith(async () => new Promise<void>(() => {}))
    const run = refreshAll()
    expect(useRefreshing().value).toBe(true)
    await vi.advanceTimersByTimeAsync(REFRESH_WAIT_MS)
    await run
    expect(useRefreshing().value).toBe(false)
    // And the next refresh is not stuck behind the hanging one.
    const next = vi.fn()
    await mountWith(next)
    const again = refreshAll()
    await vi.advanceTimersByTimeAsync(REFRESH_WAIT_MS)
    await again
    expect(next).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('refreshes nothing that is no longer mounted', async () => {
    const refresh = vi.fn()
    const wrapper = await mountWith(refresh)
    wrapper.unmount()
    await refreshAll()
    expect(refresh).not.toHaveBeenCalled()
  })
})
