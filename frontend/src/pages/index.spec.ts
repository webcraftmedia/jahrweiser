import { mountSuspended, renderSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Page from './index.vue'

const mock$fetch = vi.hoisted(() => vi.fn())

const mockColorMode = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ref, readonly } = require('vue')
  const isDark = ref(false)
  return {
    isDark,
    readonly,
  }
})

const mockCalendarFilter = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ref, readonly } = require('vue')
  const legend = ref<{ name: string; dotColor: string }[]>([])
  const hiddenCalendars = ref(new Set<string>())
  return { legend, hiddenCalendars, ref, readonly }
})

vi.mock('../composables/useCalendarFilter', () => ({
  useCalendarFilter: () => {
    function setLegend(items: { name: string; dotColor: string }[]) {
      mockCalendarFilter.legend.value = items
    }
    function toggleCalendar(name: string) {
      const s = new Set(mockCalendarFilter.hiddenCalendars.value)
      if (s.has(name)) s.delete(name)
      else s.add(name)
      mockCalendarFilter.hiddenCalendars.value = s
    }
    return {
      legend: mockCalendarFilter.readonly(mockCalendarFilter.legend),
      hiddenCalendars: mockCalendarFilter.readonly(mockCalendarFilter.hiddenCalendars),
      setLegend,
      toggleCalendar,
    }
  },
}))

const mockZoom = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ref } = require('vue')
  return { zoomLevel: ref(1.0) }
})

vi.mock('../composables/useZoom', () => ({
  useZoom: () => ({
    zoomLevel: mockZoom.zoomLevel,
    chromeZoom: { value: 1 },
    loginZoom: { value: 1 },
  }),
}))

vi.mock('../composables/useColorMode', () => ({
  useColorMode: () => ({
    isDark: mockColorMode.readonly(mockColorMode.isDark),
    toggle: () => {
      mockColorMode.isDark.value = !mockColorMode.isDark.value
    },
  }),
}))

/* ── Schedule-X mocks ── */

const mockEventsServiceSet = vi.hoisted(() => vi.fn())
const mockEventsServiceGetAll = vi.hoisted(() => vi.fn(() => []))

const mockCalendarControlsSetDate = vi.hoisted(() => vi.fn())
const mockCalendarControlsSetCalendars = vi.hoisted(() => vi.fn())
const mockCalendarControlsSetView = vi.hoisted(() => vi.fn())

const mockSetTheme = vi.hoisted(() => vi.fn())

// Track the fetchEvents and onEventClick callbacks
interface RangeArg {
  start: { epochMilliseconds: number }
  end: { epochMilliseconds: number }
}
const mockCallbacks = vi.hoisted(() => ({
  fetchEvents: null as ((range: RangeArg) => Promise<unknown[]>) | null,
  onEventClick: null as ((event: unknown) => void) | null,
}))

vi.mock('@schedule-x/vue', () => ({
  ScheduleXCalendar: {
    name: 'ScheduleXCalendar',
    template: '<div class="sx-vue-calendar-wrapper"><slot name="headerContent" /></div>',
    props: {
      calendarApp: { type: Object, required: true },
      customComponents: { type: Object, default: () => ({}) },
    },
  },
}))

vi.mock('@schedule-x/calendar', () => ({
  createCalendar: (
    config: {
      callbacks?: {
        fetchEvents?: (range: RangeArg) => Promise<unknown[]>
        onEventClick?: (event: unknown) => void
      }
    },
    _plugins: unknown[],
  ) => {
    // Capture the callbacks for test invocation
    if (config.callbacks?.fetchEvents) {
      mockCallbacks.fetchEvents = config.callbacks.fetchEvents
      // Simulate Schedule-X initial render: call fetchEvents and set returned events
      const start = new Date('2025-01-01T00:00:00Z')
      const end = new Date('2025-01-31T23:59:59Z')
      void Promise.resolve().then(async () => {
        try {
          const events = await config.callbacks!.fetchEvents!({
            start: { epochMilliseconds: start.getTime() },
            end: { epochMilliseconds: end.getTime() },
          })
          mockEventsServiceSet(events)
        } catch {
          /* error handled inside fetchEvents */
        }
      })
    }
    if (config.callbacks?.onEventClick) {
      mockCallbacks.onEventClick = config.callbacks.onEventClick
    }
    return {
      setTheme: mockSetTheme,
    }
  },
  createViewMonthGrid: () => ({ name: 'month-grid' }),
  createViewList: () => ({ name: 'list' }),
}))

vi.mock('@schedule-x/events-service', () => ({
  createEventsServicePlugin: () => ({
    set: mockEventsServiceSet,
    getAll: mockEventsServiceGetAll,
    name: 'events-service',
  }),
}))

vi.mock('@schedule-x/calendar-controls', () => ({
  createCalendarControlsPlugin: () => ({
    setDate: mockCalendarControlsSetDate,
    setCalendars: mockCalendarControlsSetCalendars,
    setView: mockCalendarControlsSetView,
    name: 'calendar-controls',
  }),
}))

vi.mock('temporal-polyfill/global', () => ({}))

vi.stubGlobal('$fetch', mock$fetch)

// Provide Temporal globally for tests (happy-dom may not have it)
if (typeof globalThis.Temporal === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Temporal } = require('temporal-polyfill')
  globalThis.Temporal = Temporal
}

describe('Page: Index', () => {
  // Track mounted wrappers for cleanup — prevents stale event listeners between tests
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrappers: any[] = []

  // Spy on addEventListener to track and clean up all listeners between tests
  const trackedListeners: {
    target: EventTarget
    type: string
    fn: EventListenerOrEventListenerObject
  }[] = []
  const origWindowAdd = window.addEventListener.bind(window)
  const origDocAdd = document.addEventListener.bind(document)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T12:00:00.000Z'))
    // Intercept addEventListener to track listeners for cleanup
    window.addEventListener = (
      type: string,
      fn: EventListenerOrEventListenerObject,
      ...args: unknown[]
    ) => {
      trackedListeners.push({ target: window, type, fn })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      origWindowAdd(type, fn, ...(args as any[]))
    }
    document.addEventListener = (
      type: string,
      fn: EventListenerOrEventListenerObject,
      ...args: unknown[]
    ) => {
      trackedListeners.push({ target: document, type, fn })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      origDocAdd(type, fn, ...(args as any[]))
    }
    mockColorMode.isDark.value = false
    mockZoom.zoomLevel.value = 1.0
    mockCalendarFilter.legend.value = []
    mockCalendarFilter.hiddenCalendars.value = new Set()
    mockCallbacks.fetchEvents = null
    mockCallbacks.onEventClick = null
    // Clean up stale modal elements from previous tests to prevent DOM pollution
    document.querySelectorAll('#default-modal').forEach((el) => {
      el.remove()
    })
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/calendars') {
        return Promise.resolve([{ name: 'Work', color: '#ff0000' }])
      }
      if (url === '/api/calendar') {
        return Promise.resolve([
          {
            id: 'event-1',
            title: 'Test',
            color: '#ff0000',
            calendar: 'Work',
            startDate: '2025-01-15',
            endDate: '2025-01-15',
          },
        ])
      }
      if (url === '/api/event') {
        return Promise.resolve({
          summary: 'Test Event',
          startDate: '2025-01-15',
          duration: 'PT2H',
          location: 'Room A',
          description: 'A test event',
        })
      }
      return Promise.resolve({})
    })
  })

  afterEach(() => {
    wrappers.forEach((w) => {
      try {
        w.unmount()
      } catch {
        // Component may already be unmounted
      }
    })
    wrappers.length = 0
    // Remove all tracked listeners to prevent cross-test leakage
    for (const { target, type, fn } of trackedListeners) {
      target.removeEventListener(type, fn)
    }
    trackedListeners.length = 0
  })

  /** Helper: mount and track wrapper for cleanup */
  async function mount({ awaitFetch = true } = {}) {
    const w = await mountSuspended(Page, { route: '/' })
    wrappers.push(w)
    if (awaitFetch) {
      // Wait for the initial fetchEvents (triggered by Schedule-X on render) to settle
      await vi.waitFor(() => {
        expect(mockEventsServiceSet).toHaveBeenCalled()
      })
    }
    return w
  }

  /** Helper: simulate Schedule-X calling fetchEvents for a new range (e.g. navigation) */
  async function triggerFetchEvents(start = '2025-01-01', end = '2025-01-31') {
    const s = new Date(start + 'T00:00:00Z')
    const e = new Date(end + 'T23:59:59Z')
    if (mockCallbacks.fetchEvents) {
      const events = await mockCallbacks.fetchEvents({
        start: { epochMilliseconds: s.getTime() },
        end: { epochMilliseconds: e.getTime() },
      })
      mockEventsServiceSet(events)
    }
  }

  it('renders', async () => {
    const html = await (
      await renderSuspended(Page, {
        route: '/',
      })
    ).html()
    expect(html).toMatchSnapshot()
  })

  it('fetches calendar data on initial render via fetchEvents', async () => {
    await mount()
    expect(mock$fetch).toHaveBeenCalledWith('/api/calendars')
    expect(mock$fetch).toHaveBeenCalledWith(
      '/api/calendar',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('returns mapped events from fetchEvents', async () => {
    await mount()
    const callWithEvents = mockEventsServiceSet.mock.calls.find(
      (c: unknown[][]) => c[0]?.length > 0,
    )
    expect(callWithEvents).toBeTruthy()
    const events = callWithEvents![0]
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('Test')
    expect(events[0]._calendar).toBe('Work')
    expect(events[0].calendarId).toBe('cal-0')
  })

  it('opens modal when clicking an event', async () => {
    await mount()
    // Simulate event click via the captured callback
    mockCallbacks.onEventClick?.({
      _calendar: 'Work',
      _originalId: 'event-1',
      _occurrence: 1,
      title: 'Test',
    })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/event', {
        method: 'POST',
        body: { calendar: 'Work', id: 'event-1', occurrence: 1 },
      })
    })
  })

  it('renders modal content with event details', async () => {
    await mount()
    mockCallbacks.onEventClick?.({
      _calendar: 'Work',
      _originalId: 'event-1',
      _occurrence: 1,
      title: 'Test',
    })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/event', expect.anything())
    })
    await nextTick()
    await nextTick()
    const modal = document.getElementById('default-modal')
    expect(modal?.textContent).toContain('Room A')
    expect(modal?.textContent).toContain('A test event')
  })

  it('renders modal content without description', async () => {
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/calendars') return Promise.resolve([{ name: 'Work', color: '#ff0000' }])
      if (url === '/api/calendar')
        return Promise.resolve([
          {
            id: 'e1',
            title: 'T',
            color: '#ff0000',
            calendar: 'Work',
            startDate: '2025-01-15',
            endDate: '2025-01-15',
          },
        ])
      if (url === '/api/event')
        return Promise.resolve({
          summary: 'No Desc',
          startDate: '2025-01-15',
          duration: 'PT1H',
          location: 'Room B',
        })
      return Promise.resolve({})
    })
    await mount()
    mockCallbacks.onEventClick?.({
      _calendar: 'Work',
      _originalId: 'e1',
      _occurrence: 1,
      title: 'T',
    })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/event', expect.anything())
    })
    await nextTick()
    await nextTick()
    const modal = document.getElementById('default-modal')
    expect(modal?.textContent).toContain('Room B')
    expect(modal?.textContent).not.toContain('A test event')
  })

  it('renders modal content without location', async () => {
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/calendars') return Promise.resolve([{ name: 'Work', color: '#ff0000' }])
      if (url === '/api/calendar')
        return Promise.resolve([
          {
            id: 'e1',
            title: 'T',
            color: '#ff0000',
            calendar: 'Work',
            startDate: '2025-01-15',
            endDate: '2025-01-15',
          },
        ])
      if (url === '/api/event')
        return Promise.resolve({
          summary: 'No Loc',
          startDate: '2025-01-15',
          duration: 'PT1H',
          description: 'Some notes',
        })
      return Promise.resolve({})
    })
    await mount()
    mockCallbacks.onEventClick?.({
      _calendar: 'Work',
      _originalId: 'e1',
      _occurrence: 1,
      title: 'T',
    })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/event', expect.anything())
    })
    await nextTick()
    await nextTick()
    const modal = document.getElementById('default-modal')
    expect(modal?.textContent).not.toContain('Room')
    expect(modal?.textContent).toContain('Some notes')
  })

  it('handles error in clickItem gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/calendars') return Promise.resolve([])
      if (url === '/api/event') return Promise.reject(new Error('fetch failed'))
      return Promise.resolve([])
    })
    await mount()
    mockCallbacks.onEventClick?.({
      _calendar: 'Work',
      _originalId: 'event-1',
      _occurrence: 1,
      title: 'Test',
    })
    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })
    consoleSpy.mockRestore()
  })

  it('navigates to next month via nav button', async () => {
    const wrapper = await mount()
    const navButtons = wrapper.findAll('.cv-header-nav button')
    const nextButton = navButtons[2]! // ‹, today, ›
    await nextButton.trigger('click')
    expect(mockCalendarControlsSetDate).toHaveBeenCalled()
    const dateArg = mockCalendarControlsSetDate.mock.calls[0]![0]
    expect(dateArg.month).toBe(2) // February
  })

  it('navigates to previous month via nav button', async () => {
    const wrapper = await mount()
    const navButtons = wrapper.findAll('.cv-header-nav button')
    const prevButton = navButtons[0]!
    await prevButton.trigger('click')
    expect(mockCalendarControlsSetDate).toHaveBeenCalled()
    const dateArg = mockCalendarControlsSetDate.mock.calls[0]![0]
    expect(dateArg.month).toBe(12) // December
    expect(dateArg.year).toBe(2024)
  })

  it('navigates to today via nav button', async () => {
    const wrapper = await mount()
    // Navigate away first so "today" button is not disabled
    const navButtons = wrapper.findAll('.cv-header-nav button')
    await navButtons[0]!.trigger('click')
    mockCalendarControlsSetDate.mockClear()
    await navButtons[1]!.trigger('click')
    expect(mockCalendarControlsSetDate).toHaveBeenCalled()
    const dateArg = mockCalendarControlsSetDate.mock.calls[0]![0]
    expect(dateArg.year).toBe(2025)
    expect(dateArg.month).toBe(1) // January
  })

  it('sets up Schedule-X calendar colors after loading calendars', async () => {
    await mount()
    expect(mockCalendarControlsSetCalendars).toHaveBeenCalled()
    const calendarsConfig = mockCalendarControlsSetCalendars.mock.calls[0]![0]
    expect(calendarsConfig['cal-0']).toBeDefined()
    expect(calendarsConfig['cal-0'].lightColors.main).toBe('#9a3412')
    expect(calendarsConfig['cal-0'].lightColors.container).toBe('#dfc8b4')
    expect(calendarsConfig['cal-0'].darkColors.main).toBe('#c2410c')
    expect(calendarsConfig['cal-0'].darkColors.container).toBe('#583020')
  })

  it('closes modal via handleModalX', async () => {
    await mount()
    mockCallbacks.onEventClick?.({
      _calendar: 'Work',
      _originalId: 'event-1',
      _occurrence: 1,
      title: 'Test',
    })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/event', expect.anything())
    })
    await nextTick()
    // Modal should be open (teleported to body)
    const modal = document.getElementById('default-modal')!
    expect(modal.classList.contains('modal-open')).toBe(true)
    // Click the modal backdrop to trigger handleModalX
    modal.click()
    await nextTick()
    // Modal should be closed
    expect(modal.classList.contains('modal-hidden')).toBe(true)
  })

  it('prevents closing modal while event is loading', async () => {
    let resolveEvent!: (v: unknown) => void
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/calendars') return Promise.resolve([{ name: 'Work', color: '#ea580c' }])
      if (url === '/api/calendar')
        return Promise.resolve([
          {
            id: 'e1',
            title: 'T',
            color: '#ea580c',
            calendar: 'Work',
            startDate: '2025-01-15',
            endDate: '2025-01-15',
          },
        ])
      if (url === '/api/event') return new Promise((r) => (resolveEvent = r))
      return Promise.resolve({})
    })
    await mount()
    mockCallbacks.onEventClick?.({
      _calendar: 'Work',
      _originalId: 'event-1',
      _occurrence: 1,
      title: 'Test',
    })
    await nextTick()
    // Modal open, still loading (teleported to body)
    const modal = document.getElementById('default-modal')!
    expect(modal.classList.contains('modal-open')).toBe(true)
    // Try to close — should be blocked
    modal.click()
    await nextTick()
    expect(modal.classList.contains('modal-open')).toBe(true)
    // Resolve loading, then close works
    resolveEvent({ summary: 'Test', dtstart: '2025-01-15' })
    await nextTick()
    modal.click()
    await nextTick()
    expect(modal.classList.contains('modal-hidden')).toBe(true)
  })

  it('skips fetching calendars when already loaded', async () => {
    await mount()
    // Calendars are now loaded from initial fetchEvents. Trigger a second fetch for a new range
    mock$fetch.mockClear()
    await triggerFetchEvents('2025-02-01', '2025-02-28')
    expect(mock$fetch).toHaveBeenCalledWith(
      '/api/calendar',
      expect.objectContaining({ method: 'POST' }),
    )
    // Should NOT have fetched calendars again
    expect(mock$fetch).not.toHaveBeenCalledWith('/api/calendars')
  })

  it('handles getData error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockRejectedValue(new Error('network error'))
    // fetchEvents catches the error and returns [] — mount still completes
    await mount()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('handles keyboard navigation ArrowRight', async () => {
    await mount()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await nextTick()
    expect(mockCalendarControlsSetDate).toHaveBeenCalled()
    const dateArg = mockCalendarControlsSetDate.mock.calls[0]![0]
    expect(dateArg.month).toBe(2) // February
  })

  it('handles keyboard navigation with a key', async () => {
    await mount()
    mockCalendarControlsSetDate.mockClear()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    await nextTick()
    expect(mockCalendarControlsSetDate).toHaveBeenCalled()
    const dateArg = mockCalendarControlsSetDate.mock.calls[0]![0]
    expect(dateArg.month).toBe(12) // December
  })

  it('ignores keyboard when modal is open', async () => {
    await mount()
    mockCallbacks.onEventClick?.({
      _calendar: 'Work',
      _originalId: 'event-1',
      _occurrence: 1,
      title: 'Test',
    })
    await nextTick()
    // Add modal element to global DOM so isModalOpen() can find it
    const fakeModal = document.createElement('div')
    fakeModal.id = 'default-modal'
    fakeModal.classList.add('modal-open')
    document.body.appendChild(fakeModal)
    // Keyboard should be ignored when modal is open
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await nextTick()
    expect(mockCalendarControlsSetDate).not.toHaveBeenCalled()
    document.body.removeChild(fakeModal)
  })

  it('cleans up keyboard listener on unmount', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const wrapper = await mount()
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    removeSpy.mockRestore()
  })

  it('handles ArrowLeft keyboard navigation', async () => {
    await mount()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await nextTick()
    expect(mockCalendarControlsSetDate).toHaveBeenCalled()
    const dateArg = mockCalendarControlsSetDate.mock.calls[0]![0]
    expect(dateArg.month).toBe(12) // December 2024
  })

  it('handles d key keyboard navigation', async () => {
    await mount()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }))
    await nextTick()
    expect(mockCalendarControlsSetDate).toHaveBeenCalled()
    const dateArg = mockCalendarControlsSetDate.mock.calls[0]![0]
    expect(dateArg.month).toBe(2) // February 2025
  })

  it('ignores unhandled keyboard keys', async () => {
    await mount()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }))
    await nextTick()
    expect(mockCalendarControlsSetDate).not.toHaveBeenCalled()
  })

  it('swipe left navigates to next month', async () => {
    const wrapper = await mount()
    const calWrapperEl = wrapper.find('.cal-wrapper')
    await calWrapperEl.trigger('touchstart', { changedTouches: [{ clientX: 200, clientY: 100 }] })
    await calWrapperEl.trigger('touchend', { changedTouches: [{ clientX: 50, clientY: 100 }] })
    expect(mockCalendarControlsSetDate).toHaveBeenCalled()
    const dateArg = mockCalendarControlsSetDate.mock.calls[0]![0]
    expect(dateArg.month).toBe(2) // February
  })

  it('swipe right navigates to previous month', async () => {
    const wrapper = await mount()
    const calWrapperEl = wrapper.find('.cal-wrapper')
    await calWrapperEl.trigger('touchstart', { changedTouches: [{ clientX: 50, clientY: 100 }] })
    await calWrapperEl.trigger('touchend', { changedTouches: [{ clientX: 200, clientY: 100 }] })
    expect(mockCalendarControlsSetDate).toHaveBeenCalled()
    const dateArg = mockCalendarControlsSetDate.mock.calls[0]![0]
    expect(dateArg.month).toBe(12) // December
  })

  it('ignores short swipes', async () => {
    const wrapper = await mount()
    const calWrapperEl = wrapper.find('.cal-wrapper')
    await calWrapperEl.trigger('touchstart', { changedTouches: [{ clientX: 100, clientY: 100 }] })
    await calWrapperEl.trigger('touchend', { changedTouches: [{ clientX: 130, clientY: 100 }] })
    expect(mockCalendarControlsSetDate).not.toHaveBeenCalled()
  })

  it('ignores vertical swipes', async () => {
    const wrapper = await mount()
    const calWrapperEl = wrapper.find('.cal-wrapper')
    await calWrapperEl.trigger('touchstart', { changedTouches: [{ clientX: 100, clientY: 100 }] })
    await calWrapperEl.trigger('touchend', { changedTouches: [{ clientX: 200, clientY: 300 }] })
    expect(mockCalendarControlsSetDate).not.toHaveBeenCalled()
  })

  it('renders calendar legend items', async () => {
    const wrapper = await mount()
    await nextTick()
    const legendItems = wrapper.findAll('.cal-legend-item')
    expect(legendItems).toHaveLength(1)
    expect(legendItems[0]!.text()).toContain('Work')
    const dot = legendItems[0]!.find('.cal-legend-dot')
    expect((dot.element as HTMLElement).style.backgroundColor).toBeTruthy()
  })

  it('toggles calendar visibility via legend click', async () => {
    // Set up 2-calendar mock BEFORE mount so initial fetch uses it
    mock$fetch.mockImplementation((url: string, opts?: { body?: { calendar?: string } }) => {
      if (url === '/api/calendars')
        return Promise.resolve([
          { name: 'Work', color: '#ff0000' },
          { name: 'Personal', color: '#00ff00' },
        ])
      if (url === '/api/calendar') {
        const cal = opts?.body?.calendar
        if (cal === 'Work')
          return Promise.resolve([
            {
              id: 'e1',
              title: 'Work Event',
              color: '#ff0000',
              calendar: 'Work',
              startDate: '2025-01-15',
              endDate: '2025-01-15',
            },
          ])
        if (cal === 'Personal')
          return Promise.resolve([
            {
              id: 'e2',
              title: 'Personal Event',
              color: '#00ff00',
              calendar: 'Personal',
              startDate: '2025-01-16',
              endDate: '2025-01-16',
            },
          ])
        return Promise.resolve([])
      }
      return Promise.resolve({})
    })
    const wrapper = await mount()
    // mount() already awaited the initial fetch — verify 2 events were loaded
    const callWithEvents = mockEventsServiceSet.mock.calls.find(
      (c: unknown[][]) => c[0]?.length === 2,
    )
    expect(callWithEvents).toBeTruthy()

    // Click "Work" legend button to hide Work events
    const legendItems = wrapper.findAll('.cal-legend-item')
    mockEventsServiceSet.mockClear()
    await legendItems[0]!.trigger('click')
    await nextTick()

    // eventsService.set should be called again with filtered events
    // Use last call — stale watchers from previous component instances may fire first
    expect(mockEventsServiceSet).toHaveBeenCalled()
    const filteredCalls = mockEventsServiceSet.mock.calls
    const filteredEvents = filteredCalls[filteredCalls.length - 1]![0]
    expect(filteredEvents).toHaveLength(1)
    expect(filteredEvents[0].title).toBe('Personal Event')

    // Hidden legend item should have the hidden class
    expect(wrapper.findAll('.cal-legend-item')[0]!.classes()).toContain('cal-legend-hidden')

    // Click again to show Work events
    mockEventsServiceSet.mockClear()
    await wrapper.findAll('.cal-legend-item')[0]!.trigger('click')
    await nextTick()

    expect(mockEventsServiceSet).toHaveBeenCalled()
    const allCalls = mockEventsServiceSet.mock.calls
    const allEvents = allCalls[allCalls.length - 1]![0]
    expect(allEvents).toHaveLength(2)
    expect(wrapper.findAll('.cal-legend-item')[0]!.classes()).not.toContain('cal-legend-hidden')
  })

  it('opens legend when mouse is near bottom of cal-wrapper', async () => {
    const wrapper = await mount()
    const calWrapperEl = wrapper.find('.cal-wrapper')
    vi.spyOn(calWrapperEl.element, 'getBoundingClientRect').mockReturnValue({
      bottom: 500,
      top: 0,
      left: 0,
      right: 800,
      width: 800,
      height: 500,
      x: 0,
      y: 0,
      toJSON: () => {},
    })
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 470 }))
    await nextTick()
    expect(wrapper.find('.cal-legend').classes()).toContain('cal-legend-open')
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 100 }))
    vi.advanceTimersByTime(300)
    await nextTick()
    expect(wrapper.find('.cal-legend').classes()).not.toContain('cal-legend-open')
  })

  it('opens legend when mouse is below cal-wrapper', async () => {
    const wrapper = await mount()
    const calWrapperEl = wrapper.find('.cal-wrapper')
    vi.spyOn(calWrapperEl.element, 'getBoundingClientRect').mockReturnValue({
      bottom: 500,
      top: 0,
      left: 0,
      right: 800,
      width: 800,
      height: 500,
      x: 0,
      y: 0,
      toJSON: () => {},
    })
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 600 }))
    await nextTick()
    expect(wrapper.find('.cal-legend').classes()).toContain('cal-legend-open')
  })

  it('cancels legend close timer when mouse re-enters trigger zone', async () => {
    const wrapper = await mount()
    const calWrapperEl = wrapper.find('.cal-wrapper')
    vi.spyOn(calWrapperEl.element, 'getBoundingClientRect').mockReturnValue({
      bottom: 500,
      top: 0,
      left: 0,
      right: 800,
      width: 800,
      height: 500,
      x: 0,
      y: 0,
      toJSON: () => {},
    })
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 470 }))
    await nextTick()
    expect(wrapper.find('.cal-legend').classes()).toContain('cal-legend-open')
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 100 }))
    vi.advanceTimersByTime(100)
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 480 }))
    vi.advanceTimersByTime(300)
    await nextTick()
    expect(wrapper.find('.cal-legend').classes()).toContain('cal-legend-open')
  })

  it('ignores mousemove when legend is closed and mouse is outside trigger zone', async () => {
    const wrapper = await mount()
    const calWrapperEl = wrapper.find('.cal-wrapper')
    vi.spyOn(calWrapperEl.element, 'getBoundingClientRect').mockReturnValue({
      bottom: 500,
      top: 0,
      left: 0,
      right: 800,
      width: 800,
      height: 500,
      x: 0,
      y: 0,
      toJSON: () => {},
    })
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 100 }))
    await nextTick()
    expect(wrapper.find('.cal-legend').classes()).not.toContain('cal-legend-open')
  })

  it('cleans up mousemove listener on unmount', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const wrapper = await mount()
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
    removeSpy.mockRestore()
  })

  it('shows loading overlay during data fetch', async () => {
    let resolveCalendars!: (value: unknown) => void
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/calendars') {
        return new Promise((resolve) => {
          resolveCalendars = resolve
        })
      }
      return Promise.resolve([])
    })
    // Mount without awaiting fetch — the pending promise keeps calLoading true
    const wrapper = await mount({ awaitFetch: false })
    await nextTick()
    await nextTick()
    // Loading overlay should be visible while fetch is pending (v-show)
    const overlay = wrapper.find('.cal-loading-overlay')
    expect(overlay.exists()).toBe(true)
    expect((overlay.element as HTMLElement).style.display).not.toBe('none')
    // Resolve the fetch
    resolveCalendars([{ name: 'Work', color: '#ff0000' }])
    await vi.waitFor(() => {
      expect((wrapper.find('.cal-loading-overlay').element as HTMLElement).style.display).toBe(
        'none',
      )
    })
  })

  it('updates theme when isDark changes', async () => {
    await mount()
    mockColorMode.isDark.value = true
    await nextTick()
    expect(mockSetTheme).toHaveBeenCalledWith('dark')
    mockColorMode.isDark.value = false
    await nextTick()
    expect(mockSetTheme).toHaveBeenCalledWith('light')
  })

  it('headerZoomStyle returns mobile zoom when lastWasSmall', async () => {
    // Set zoom > 1 so headerZoomStyle branches execute
    mockZoom.zoomLevel.value = 1.5
    // Simulate mobile viewport
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true })
    const wrapper = await mount()
    // Trigger resize to set lastWasSmall
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    const header = wrapper.find('.cv-header')
    expect(header.exists()).toBe(true)
    // The header should have a zoom style applied (mobile path)
    const style = (header.element as HTMLElement).style
    expect(style.zoom).toBeTruthy()
    // Restore
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
  })

  it('headerZoomStyle returns desktop slight zoom', async () => {
    mockZoom.zoomLevel.value = 1.5
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
    const wrapper = await mount()
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    const header = wrapper.find('.cv-header')
    const style = (header.element as HTMLElement).style
    // Desktop: slight = 1 + (1.5 - 1) * 0.3 = 1.15
    expect(style.zoom).toBeTruthy()
  })

  it('boxZoomStyle applies counter-zoom on desktop', async () => {
    mockZoom.zoomLevel.value = 1.5
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
    const wrapper = await mount()
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    const box = wrapper.find('.box')
    const style = (box.element as HTMLElement).style
    expect(style.zoom).toBeTruthy()
    expect(style.width).toContain('%')
  })

  it('onResize switches view when crossing breakpoint', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
    await mount()
    // Switch to mobile
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true })
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(mockCalendarControlsSetView).toHaveBeenCalledWith('list')
    // Switch back to desktop
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(mockCalendarControlsSetView).toHaveBeenCalledWith('month-grid')
  })

  it('onResize does nothing when size stays in same range', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
    await mount()
    mockCalendarControlsSetView.mockClear()
    // Same range (still desktop)
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true })
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(mockCalendarControlsSetView).not.toHaveBeenCalled()
  })

  it('handles datetime strings in toTemporalDate', async () => {
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/calendars') return Promise.resolve([{ name: 'Work', color: '#ff0000' }])
      if (url === '/api/calendar')
        return Promise.resolve([
          {
            id: 'e1',
            title: 'Timed',
            color: '#ff0000',
            calendar: 'Work',
            startDate: '2025-01-15T10:00:00Z',
            endDate: '2025-01-15T12:00:00Z',
          },
        ])
      return Promise.resolve({})
    })
    await mount()
    // Find the call that has the 'Timed' event (not the initial 'Test' event)
    await triggerFetchEvents()
    const callWithTimed = mockEventsServiceSet.mock.calls.find((c: unknown[][]) =>
      c[0]?.some((e: { title: string }) => e.title === 'Timed'),
    )
    expect(callWithTimed).toBeTruthy()
    const events = callWithTimed![0]
    expect(events[0].title).toBe('Timed')
  })

  it('handles calendar fetch failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/calendars') return Promise.resolve([{ name: 'Work', color: '#ff0000' }])
      if (url === '/api/calendar') return Promise.reject(new Error('network error'))
      return Promise.resolve({})
    })
    await mount()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch calendar'),
      expect.anything(),
    )
    consoleSpy.mockRestore()
  })

  it('applyFutureClass marks future and today days', async () => {
    await mount()
    // Create mock day elements
    const todayStr = new Date('2025-01-15T12:00:00.000Z').toISOString().slice(0, 10)
    const dayEl = document.createElement('div')
    dayEl.classList.add('sx__month-grid-day')
    dayEl.setAttribute('data-date', todayStr)
    document.body.appendChild(dayEl)
    const futureEl = document.createElement('div')
    futureEl.classList.add('sx__month-grid-day')
    futureEl.setAttribute('data-date', '2025-01-20')
    document.body.appendChild(futureEl)
    const pastEl = document.createElement('div')
    pastEl.classList.add('sx__month-grid-day')
    pastEl.setAttribute('data-date', '2025-01-10')
    document.body.appendChild(pastEl)
    // Trigger applyFutureClass via the delayed timers
    vi.advanceTimersByTime(200)
    expect(dayEl.classList.contains('is-today')).toBe(true)
    expect(dayEl.classList.contains('is-future')).toBe(true)
    expect(futureEl.classList.contains('is-future')).toBe(true)
    expect(pastEl.classList.contains('is-future')).toBe(false)
    // List view elements
    const listDayEl = document.createElement('div')
    listDayEl.classList.add('sx__list-day')
    listDayEl.setAttribute('data-date', todayStr)
    document.body.appendChild(listDayEl)
    vi.advanceTimersByTime(200)
    expect(listDayEl.classList.contains('is-today')).toBe(true)
    // Clean up
    dayEl.remove()
    futureEl.remove()
    pastEl.remove()
    listDayEl.remove()
  })

  it('debouncedApplyFuture fires via MutationObserver', async () => {
    // Create a .sx__calendar element before mount so the observer attaches
    const calRoot = document.createElement('div')
    calRoot.classList.add('sx__calendar')
    document.body.appendChild(calRoot)
    await mount()
    // Create a day element to verify applyFutureClass runs
    const dayEl = document.createElement('div')
    dayEl.classList.add('sx__month-grid-day')
    dayEl.setAttribute('data-date', '2025-01-20')
    // Mutate the calendar root to trigger the observer
    calRoot.appendChild(dayEl)
    // Wait for debounce (30ms) + observer microtask
    vi.advanceTimersByTime(50)
    await nextTick()
    expect(dayEl.classList.contains('is-future')).toBe(true)
    calRoot.remove()
  })

  it('scrollToDay scrolls to today element when present', async () => {
    const todayStr = '2025-01-15'
    // Create a today element in the DOM
    const todayEl = document.createElement('div')
    todayEl.classList.add('sx__month-grid-day')
    todayEl.setAttribute('data-date', todayStr)
    const innerEl = document.createElement('div')
    innerEl.classList.add('sx__is-today')
    todayEl.appendChild(innerEl)
    document.body.appendChild(todayEl)
    const scrollSpy = vi.spyOn(todayEl, 'scrollIntoView').mockImplementation(() => {})
    await mount()
    // Navigate to today to trigger scrollToDay
    const navButtons = (await mount()).findAll('.cv-header-nav button')
    await navButtons[1]!.trigger('click') // today button
    vi.advanceTimersByTime(400)
    expect(scrollSpy).toHaveBeenCalled()
    todayEl.remove()
  })

  it('scrollToDay scrolls to first of month when today not present', async () => {
    // Create a first-of-month element (no today)
    const firstEl = document.createElement('div')
    firstEl.classList.add('sx__month-grid-day')
    firstEl.setAttribute('data-date', '2025-01-01')
    document.body.appendChild(firstEl)
    const scrollSpy = vi.spyOn(firstEl, 'scrollIntoView').mockImplementation(() => {})
    await mount()
    const wrapper = await mount()
    const navButtons = wrapper.findAll('.cv-header-nav button')
    await navButtons[1]!.trigger('click') // today button
    vi.advanceTimersByTime(400)
    expect(scrollSpy).toHaveBeenCalled()
    firstEl.remove()
  })

  it('stagger animation runs on month-grid events', async () => {
    // Create mock event elements before mount (2 events to cover sort comparator)
    const dayEl = document.createElement('div')
    dayEl.classList.add('sx__month-grid-day')
    dayEl.setAttribute('data-date', '2025-01-15')
    const eventEl = document.createElement('div')
    eventEl.classList.add('sx__month-grid-event')
    dayEl.appendChild(eventEl)
    document.body.appendChild(dayEl)
    const dayEl2 = document.createElement('div')
    dayEl2.classList.add('sx__month-grid-day')
    dayEl2.setAttribute('data-date', '2025-01-16')
    const eventEl2 = document.createElement('div')
    eventEl2.classList.add('sx__month-grid-event')
    dayEl2.appendChild(eventEl2)
    document.body.appendChild(dayEl2)
    // Mock requestAnimationFrame to run callbacks synchronously
    const origRAF = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    }
    await mount()
    // Advance timers so stagger fade-in completes
    vi.advanceTimersByTime(500)
    // Stagger should have set transition and final opacity/transform
    expect(eventEl.style.transition).toContain('opacity')
    expect(eventEl.style.opacity).toBe('1')
    expect(eventEl.style.transform).toBe('translateY(0)')
    expect(eventEl2.style.opacity).toBe('1')
    globalThis.requestAnimationFrame = origRAF
    dayEl.remove()
    dayEl2.remove()
  })

  it('stagger poll retries when no events found yet', async () => {
    // No events in DOM — poll should retry via RAF, hitting else-if branch
    const rafCallbacks: FrameRequestCallback[] = []
    const origRAF = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    }
    await mount()
    // Execute RAF callbacks one by one to simulate polling retries
    // Each call with no events should increment attempts and schedule another RAF
    const prevLength = rafCallbacks.length
    if (rafCallbacks.length > 0) {
      rafCallbacks[rafCallbacks.length - 1]!(0)
    }
    // A new RAF callback should have been scheduled (retry)
    expect(rafCallbacks.length).toBeGreaterThan(prevLength)
    globalThis.requestAnimationFrame = origRAF
  })

  it('stagger sorts events without parent day gracefully', async () => {
    // Events NOT inside .sx__month-grid-day — closest() returns null → ?? '' fallback
    const eventEl1 = document.createElement('div')
    eventEl1.classList.add('sx__month-grid-event')
    document.body.appendChild(eventEl1)
    const eventEl2 = document.createElement('div')
    eventEl2.classList.add('sx__month-grid-event')
    document.body.appendChild(eventEl2)
    const origRAF = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    }
    await mount()
    vi.advanceTimersByTime(500)
    // Both events should still get animated despite no parent day
    expect(eventEl1.style.opacity).toBe('1')
    expect(eventEl2.style.opacity).toBe('1')
    globalThis.requestAnimationFrame = origRAF
    eventEl1.remove()
    eventEl2.remove()
  })

  it('clickItem handles event with empty title', async () => {
    await mount()
    mockCallbacks.onEventClick?.({
      _calendar: 'Work',
      _originalId: 'event-1',
      _occurrence: 1,
      title: '',
    })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/event', expect.anything())
    })
  })

  it('maps events with occurrence to composite id', async () => {
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/calendars') return Promise.resolve([{ name: 'Work', color: '#ff0000' }])
      if (url === '/api/calendar')
        return Promise.resolve([
          {
            id: 'rec-1',
            title: 'Recurring',
            color: '#ff0000',
            calendar: 'Work',
            startDate: '2025-01-15',
            endDate: '2025-01-15',
            occurrence: 3,
          },
        ])
      return Promise.resolve({})
    })
    await mount()
    await triggerFetchEvents()
    const callWithRecurring = mockEventsServiceSet.mock.calls.find((c: unknown[][]) =>
      c[0]?.some((e: { title: string }) => e.title === 'Recurring'),
    )
    expect(callWithRecurring).toBeTruthy()
    const events = callWithRecurring![0]
    expect(events[0].id).toBe('rec-1-3')
  })

  it('falls back to calendarId cal-0 for unknown calendar', async () => {
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/calendars') return Promise.resolve([{ name: 'Work', color: '#ff0000' }])
      if (url === '/api/calendar')
        return Promise.resolve([
          {
            id: 'e1',
            title: 'Orphan',
            color: '#ff0000',
            calendar: 'Unknown',
            startDate: '2025-01-15',
            endDate: '2025-01-15',
          },
        ])
      return Promise.resolve({})
    })
    await mount()
    await triggerFetchEvents()
    const callWithOrphan = mockEventsServiceSet.mock.calls.find((c: unknown[][]) =>
      c[0]?.some((e: { title: string }) => e.title === 'Orphan'),
    )
    expect(callWithOrphan).toBeTruthy()
    const events = callWithOrphan![0]
    expect(events[0].calendarId).toBe('cal-0')
  })

  it('calendarBodyZoomStyle applies zoom on mobile with zoom > 1', async () => {
    mockZoom.zoomLevel.value = 1.5
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true })
    const wrapper = await mount()
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    // ScheduleXCalendar should have zoom style applied on mobile
    const sxCalendar = wrapper.find('.sx-vue-calendar-wrapper')
    expect(sxCalendar.exists()).toBe(true)
    // Restore
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
  })

  it('stagger poll gives up after 60 attempts', async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const origRAF = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    }
    await mount()
    // Run poll 61 times to exhaust the retry limit
    for (let i = 0; i < 61; i++) {
      const last = rafCallbacks[rafCallbacks.length - 1]
      if (!last) break
      last(0)
    }
    // After 60 retries, no new callback should be added
    const lengthAfterExhaust = rafCallbacks.length
    // The last call should NOT have scheduled another
    const lastCb = rafCallbacks[rafCallbacks.length - 1]
    if (lastCb) lastCb(0)
    expect(rafCallbacks.length).toBe(lengthAfterExhaust)
    globalThis.requestAnimationFrame = origRAF
  })
})
