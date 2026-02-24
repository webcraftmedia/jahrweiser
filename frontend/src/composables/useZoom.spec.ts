import { describe, expect, it, vi, beforeEach } from 'vitest'

let useZoom: typeof import('./useZoom').useZoom

describe('useZoom', () => {
  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    const mod = await import('./useZoom')
    useZoom = mod.useZoom
  })

  it('defaults to zoom 1.0', () => {
    const { zoomLevel } = useZoom()
    expect(zoomLevel.value).toBe(1.0)
  })

  it('reads stored zoom from localStorage', async () => {
    localStorage.setItem('jahrweiser-zoom', '1.3')
    vi.resetModules()
    const mod = await import('./useZoom')
    const { zoomLevel } = mod.useZoom()
    expect(zoomLevel.value).toBe(1.3)
  })

  it('ignores invalid stored zoom', async () => {
    localStorage.setItem('jahrweiser-zoom', '5.0')
    vi.resetModules()
    const mod = await import('./useZoom')
    const { zoomLevel } = mod.useZoom()
    expect(zoomLevel.value).toBe(1.0)
  })

  it('ignores NaN stored zoom', async () => {
    localStorage.setItem('jahrweiser-zoom', 'abc')
    vi.resetModules()
    const mod = await import('./useZoom')
    const { zoomLevel } = mod.useZoom()
    expect(zoomLevel.value).toBe(1.0)
  })

  it('persists zoom changes to localStorage', async () => {
    const { zoomLevel } = useZoom()
    zoomLevel.value = 1.5
    await nextTick()
    expect(localStorage.getItem('jahrweiser-zoom')).toBe('1.5')
  })

  it('computes chromeZoom correctly', () => {
    const { zoomLevel, chromeZoom } = useZoom()
    zoomLevel.value = 1.0
    expect(chromeZoom.value).toBe(1.0)
  })

  it('computes loginZoom correctly', () => {
    const { zoomLevel, loginZoom } = useZoom()
    zoomLevel.value = 1.0
    expect(loginZoom.value).toBe(1.0)
  })
})
