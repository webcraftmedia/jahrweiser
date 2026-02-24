import { describe, expect, it, vi, beforeEach } from 'vitest'

// Reset module state between tests
let useColorMode: typeof import('./useColorMode').useColorMode

describe('useColorMode', () => {
  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    document.querySelectorAll('.color-switch-overlay').forEach((el) => el.remove())
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
    } as unknown as MediaQueryList)
    const mod = await import('./useColorMode')
    useColorMode = mod.useColorMode
  })

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
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })
    const { toggle } = useColorMode()
    toggle()
    const overlay = document.querySelector('.color-switch-overlay') as HTMLElement
    expect(overlay).toBeTruthy()
    expect(overlay.style.backgroundColor).toBe('#faf5eb')
    expect(overlay.style.clipPath).toContain('circle(0%')
    // Clean up
    overlay.remove()
  })

  it('removes existing overlay on rapid toggle', () => {
    const { toggle } = useColorMode()
    toggle()
    expect(document.querySelectorAll('.color-switch-overlay')).toHaveLength(1)
    toggle()
    // Old overlay removed, new one created
    expect(document.querySelectorAll('.color-switch-overlay')).toHaveLength(1)
    expect((document.querySelector('.color-switch-overlay') as HTMLElement).style.backgroundColor).toBe('#1a1714')
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
