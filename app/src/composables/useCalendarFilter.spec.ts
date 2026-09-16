import { describe, expect, it, beforeEach, vi } from 'vitest'

let useCalendarFilter: typeof import('./useCalendarFilter').useCalendarFilter

describe('useCalendarFilter', () => {
  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('./useCalendarFilter')
    useCalendarFilter = mod.useCalendarFilter
  })

  it('starts with empty legend and no hidden calendars', () => {
    const { legend, hiddenCalendars } = useCalendarFilter()
    expect(legend.value).toStrictEqual([])
    expect(hiddenCalendars.value.size).toBe(0)
  })

  it('setLegend populates the legend', () => {
    const { legend, setLegend } = useCalendarFilter()
    setLegend([
      { name: 'Work', dotColor: '#ff0000' },
      { name: 'Personal', dotColor: '#00ff00' },
    ])
    expect(legend.value).toStrictEqual([
      { name: 'Work', dotColor: '#ff0000' },
      { name: 'Personal', dotColor: '#00ff00' },
    ])
  })

  it('toggleCalendar hides and shows a calendar', () => {
    const { hiddenCalendars, toggleCalendar } = useCalendarFilter()
    toggleCalendar('Work')
    expect(hiddenCalendars.value.has('Work')).toBe(true)
    toggleCalendar('Work')
    expect(hiddenCalendars.value.has('Work')).toBe(false)
  })

  it('shares state across multiple calls', () => {
    const a = useCalendarFilter()
    const b = useCalendarFilter()
    a.setLegend([{ name: 'Shared', dotColor: '#aaa' }])
    expect(b.legend.value).toStrictEqual([{ name: 'Shared', dotColor: '#aaa' }])
    a.toggleCalendar('Shared')
    expect(b.hiddenCalendars.value.has('Shared')).toBe(true)
  })

  it('legend and hiddenCalendars are readonly', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { legend, hiddenCalendars, setLegend } = useCalendarFilter()
    setLegend([{ name: 'A', dotColor: '#000' }])
    // Writing to a readonly ref is silently ignored (Vue warns but doesn't throw)
    // @ts-expect-error testing readonly
    legend.value = []
    // Value should still be the original
    expect(legend.value).toStrictEqual([{ name: 'A', dotColor: '#000' }])
    // @ts-expect-error testing readonly
    hiddenCalendars.value = new Set(['X'])
    expect(hiddenCalendars.value.size).toBe(0)
    warnSpy.mockRestore()
  })
})
