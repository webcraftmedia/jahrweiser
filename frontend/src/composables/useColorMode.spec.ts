import { describe, expect, it, vi, beforeEach } from 'vitest'

// Reset module state between tests
let useColorMode: typeof import('./useColorMode').useColorMode

describe('useColorMode', () => {
  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    document.documentElement.classList.remove('dark')
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
})
