import { describe, expect, it, vi, beforeEach, onTestFinished } from 'vitest'

// Reset module state between tests
let useColorMode: typeof import('./useColorMode').useColorMode

describe('useColorMode', () => {
  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    document.querySelectorAll('.color-switch-overlay').forEach((el) => {
      el.remove()
    })
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
    } as unknown as MediaQueryList)
    // Run frame callbacks straight away: the sweep defers the colour flip by
    // two frames, and every assertion below is about the end state.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const mod = await import('./useColorMode')
    useColorMode = mod.useColorMode
  })

  /** The circle inside the overlay — it carries colour and animation. */
  const circle = () => document.querySelector('.color-switch-circle')

  it('defaults to light mode', () => {
    const { isDark } = useColorMode()
    expect(isDark.value).toBe(false)
  })

  it('reads dark mode from localStorage', async () => {
    localStorage.setItem('jahrweiser-dark', 'true')
    vi.resetModules()
    const mod = await import('./useColorMode')
    const { isDark } = mod.useColorMode()
    expect(isDark.value).toBe(true)
  })

  it('falls back to matchMedia when no localStorage', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
    } as unknown as MediaQueryList)
    vi.resetModules()
    const mod = await import('./useColorMode')
    const { isDark } = mod.useColorMode()
    expect(isDark.value).toBe(true)
  })

  it('skips initialization on second call', () => {
    const first = useColorMode()
    // Second call should return same state without re-initializing
    const second = useColorMode()
    expect(first.isDark.value).toBe(second.isDark.value)
  })

  it('toggle switches dark mode and persists', () => {
    const { isDark, toggle } = useColorMode()
    expect(isDark.value).toBe(false)
    toggle()
    expect(isDark.value).toBe(true)
    expect(localStorage.getItem('jahrweiser-dark')).toBe('true')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    toggle()
    expect(isDark.value).toBe(false)
    expect(localStorage.getItem('jahrweiser-dark')).toBe('false')
  })

  it('creates color-switch overlay during toggle', () => {
    const { toggle } = useColorMode()
    toggle()
    const overlay = document.querySelector('.color-switch-overlay') as HTMLElement
    expect(overlay).toBeTruthy()
    expect(circle()?.style.backgroundColor).toBe('#faf5eb')
    // Scaled away, not clipped away — see assets/css/jahrweiser.css.
    expect(circle()?.style.transform).toBe('scale(0)')
    // Clean up
    overlay.remove()
  })

  it('sizes the circle to cover the viewport from its anchor corner', () => {
    // jsdom reports 0 for both; shadow the prototype getters with real numbers.
    for (const [prop, value] of [
      ['clientWidth', 400],
      ['clientHeight', 300],
    ] as const) {
      Object.defineProperty(document.documentElement, prop, { value, configurable: true })
    }
    onTestFinished(() => {
      Reflect.deleteProperty(document.documentElement, 'clientWidth')
      Reflect.deleteProperty(document.documentElement, 'clientHeight')
    })
    const { toggle } = useColorMode()
    toggle()
    // `circle(150%)` resolved against hypot(w, h) / sqrt(2) — preserved so the
    // sweep looks and lasts exactly as it did with clip-path.
    const radius = Math.ceil((1.5 * Math.hypot(400, 300)) / Math.SQRT2)
    expect(circle()?.style.width).toBe(`${radius * 2}px`)
    // Light→dark anchors top-right: centred on x = width, y = 0.
    expect(circle()?.style.left).toBe(`${400 - radius}px`)
    expect(circle()?.style.top).toBe(`${0 - radius}px`)
    document.querySelector('.color-switch-overlay')?.remove()
  })

  it('applies the dark class only once the overlay has had a frame', () => {
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb)
      return frames.length
    })
    const { toggle } = useColorMode()
    toggle()
    // Overlay is up, but the page underneath must not have switched yet —
    // otherwise a slow first paint of the overlay lets the new colours flash.
    expect(document.querySelector('.color-switch-overlay')).toBeTruthy()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    frames.shift()?.(0)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    frames.shift()?.(0)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    document.querySelector('.color-switch-overlay')?.remove()
  })

  it('removes existing overlay on rapid toggle', () => {
    const { toggle } = useColorMode()
    toggle()
    expect(document.querySelectorAll('.color-switch-overlay')).toHaveLength(1)
    toggle()
    // Old overlay removed, new one created
    expect(document.querySelectorAll('.color-switch-overlay')).toHaveLength(1)
    expect(circle()?.style.backgroundColor).toBe('#1a1714')
    document.querySelector('.color-switch-overlay')?.remove()
  })

  it('cancels the pending frame of an interrupted sweep', () => {
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')
    const { toggle } = useColorMode()
    toggle()
    toggle()
    // Without this the first sweep's callback would apply the colours of a
    // switch the second toggle has already undone.
    expect(cancel).toHaveBeenCalled()
    document.querySelector('.color-switch-overlay')?.remove()
  })

  it('removes overlay on transitionend', () => {
    const { toggle } = useColorMode()
    toggle()
    const overlay = document.querySelector('.color-switch-overlay') as HTMLElement
    expect(overlay).toBeTruthy()
    overlay.dispatchEvent(new Event('transitionend'))
    expect(document.querySelector('.color-switch-overlay')).toBeNull()
  })

  it('removes overlay via timeout fallback', () => {
    vi.useFakeTimers()
    const { toggle } = useColorMode()
    toggle()
    expect(document.querySelector('.color-switch-overlay')).toBeTruthy()
    vi.advanceTimersByTime(1100)
    expect(document.querySelector('.color-switch-overlay')).toBeNull()
    vi.useRealTimers()
  })

  it('skips animation when prefers-reduced-motion', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query === '(prefers-reduced-motion: reduce)',
          addEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    )
    const { isDark, toggle } = useColorMode()
    toggle()
    expect(isDark.value).toBe(true)
    expect(document.querySelector('.color-switch-overlay')).toBeNull()
  })
})
