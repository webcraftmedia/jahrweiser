import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RESUME_REFRESH_AFTER_MS, useRefreshOnResume } from './useRefreshOnResume'

/** What `document.visibilityState` answers — happy-dom has no setter for it. */
let visibility: DocumentVisibilityState = 'visible'

function setVisibility(state: DocumentVisibilityState): void {
  visibility = state
  document.dispatchEvent(new Event('visibilitychange'))
}

function pageShow(persisted: boolean): void {
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted }))
}

/** Mounts a component whose only job is to register `refresh`. */
async function mountWith(refresh: () => void | Promise<void>) {
  return mountSuspended(
    defineComponent({
      setup() {
        useRefreshOnResume(refresh)
        return () => h('div')
      },
    }),
  )
}

describe('useRefreshOnResume', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-04T08:00:00Z'))
    visibility = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  })

  afterEach(() => {
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
