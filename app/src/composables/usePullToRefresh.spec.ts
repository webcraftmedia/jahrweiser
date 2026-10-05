import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PULL_THRESHOLD_PX, usePullToRefresh } from './usePullToRefresh'
import { useRefreshing } from './useRefreshable'

const mockRefreshAll = vi.hoisted(() => vi.fn())
vi.mock('./useRefreshable', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useRefreshable')>()),
  refreshAll: mockRefreshAll,
}))

/** A touch at (x, y) on an element inside a `.content` scrolled to `scrollTop`. */
function touchEvent(x: number, y: number, scrollTop = 0, fingers = 1) {
  const content = document.createElement('div')
  content.className = 'content'
  Object.defineProperty(content, 'scrollTop', { value: scrollTop })
  const target = document.createElement('div')
  content.appendChild(target)
  return {
    currentTarget: target,
    touches: Array.from({ length: fingers }, () => ({ clientX: x, clientY: y })),
  } as unknown as TouchEvent
}

async function setup(enabled = true) {
  let api!: ReturnType<typeof usePullToRefresh>
  await mountSuspended(
    defineComponent({
      setup() {
        api = usePullToRefresh(ref(enabled))
        return () => h('div')
      },
    }),
  )
  return api
}

/** Down by `dy` (and sideways by `dx`) from (100, 100). */
function drag(api: ReturnType<typeof usePullToRefresh>, dy: number, dx = 0, scrollTop = 0) {
  api.onTouchStart(touchEvent(100, 100, scrollTop))
  api.onTouchMove(touchEvent(100 + dx, 100 + dy))
}

describe('usePullToRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useRefreshing().value = false
  })

  it('follows the finger at half its way and refreshes past the threshold', async () => {
    const api = await setup()
    drag(api, 2 * PULL_THRESHOLD_PX)
    expect(api.pull.value).toBe(PULL_THRESHOLD_PX)
    expect(api.armed.value).toBe(true)
    api.onTouchEnd()
    expect(mockRefreshAll).toHaveBeenCalledTimes(1)
    expect(api.pull.value).toBe(0)
  })

  it('stops following at its maximum', async () => {
    const api = await setup()
    drag(api, 1000)
    expect(api.pull.value).toBe(96)
  })

  it('lets go of a short pull without refreshing', async () => {
    const api = await setup()
    drag(api, PULL_THRESHOLD_PX)
    expect(api.armed.value).toBe(false)
    api.onTouchEnd()
    expect(mockRefreshAll).not.toHaveBeenCalled()
  })

  it.each([
    ['the page is scrolled down', () => drag, 200, 0, 50],
    ['the movement is sideways — that changes the month', () => drag, 100, 150, 0],
  ])('does not pull when %s', async (_label, _drag, dy, dx, scrollTop) => {
    const api = await setup()
    drag(api, dy, dx, scrollTop)
    api.onTouchEnd()
    expect(api.pull.value).toBe(0)
    expect(mockRefreshAll).not.toHaveBeenCalled()
  })

  it('gives the gesture back for good once it went upwards', async () => {
    const api = await setup()
    api.onTouchStart(touchEvent(100, 100))
    api.onTouchMove(touchEvent(100, 90))
    api.onTouchMove(touchEvent(100, 300))
    expect(api.pull.value).toBe(0)
  })

  it.each([
    ['outside the installed app', false, false, 1],
    ['while a refresh runs', true, true, 1],
    ['with two fingers — that is a zoom', true, false, 2],
  ])('does nothing %s', async (_label, enabled, refreshing, fingers) => {
    const api = await setup(enabled)
    useRefreshing().value = refreshing
    api.onTouchStart(touchEvent(100, 100, 0, fingers))
    api.onTouchMove(touchEvent(100, 400))
    expect(api.pull.value).toBe(0)
  })

  it('falls back to the document when there is no layout scroller', async () => {
    const api = await setup()
    const target = document.createElement('div')
    api.onTouchStart({
      currentTarget: target,
      touches: [{ clientX: 0, clientY: 0 }],
    } as unknown as TouchEvent)
    api.onTouchMove({ touches: [{ clientX: 0, clientY: 300 }] } as unknown as TouchEvent)
    expect(api.armed.value).toBe(true)
  })
})
