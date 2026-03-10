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

const mockSetTheme = vi.hoisted(() => vi.fn())

// Track the onRangeUpdate and onEventClick callbacks
const mockCallbacks = vi.hoisted(() => ({
  onRangeUpdate: null as ((range: { start: { epochMilliseconds: number }; end: { epochMilliseconds: number } }) => void) | null,
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
  createCalendar: (config: { callbacks?: { onRangeUpdate?: (range: unknown) => void; onEventClick?: (event: unknown) => void } }, _plugins: unknown[]) => {
    // Capture the callbacks for test invocation
    if (config.callbacks?.onRangeUpdate) {
      mockCallbacks.onRangeUpdate = config.callbacks.onRangeUpdate as typeof mockCallbacks.onRangeUpdate
    }
    if (config.callbacks?.onEventClick) {
      mockCallbacks.onEventClick = config.callbacks.onEventClick as typeof mockCallbacks.onEventClick
    }
    return {
      setTheme: mockSetTheme,
    }
  },
  createViewMonthGrid: () => ({ name: 'month-grid' }),
  createViewMonthAgenda: () => ({ name: 'month-agenda' }),
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
  const trackedListeners: { target: EventTarget; type: string; fn: EventListenerOrEventListenerObject }[] = []
  const origWindowAdd = window.addEventListener.bind(window)
  const origDocAdd = document.addEventListener.bind(document)

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

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T12:00:00.000Z'))
    // Intercept addEventListener to track listeners for cleanup
    window.addEventListener = (type: string, fn: EventListenerOrEventListenerObject, ...args: unknown[]) => {
      trackedListeners.push({ target: window, type, fn })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return origWindowAdd(type, fn, ...(args as any[]))
    }
    document.addEventListener = (type: string, fn: EventListenerOrEventListenerObject, ...args: unknown[]) => {
      trackedListeners.push({ target: document, type, fn })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return origDocAdd(type, fn, ...(args as any[]))
    }
    mockColorMode.isDark.value = false
    mockCalendarFilter.legend.value = []
    mockCalendarFilter.hiddenCalendars.value = new Set()
    mockCallbacks.onRangeUpdate = null
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

  /** Helper: mount and track wrapper for cleanup */
  async function mount() {
    const w = await mountSuspended(Page, { route: '/' })
    wrappers.push(w)
    return w
  }

  /** Helper: trigger onRangeUpdate to simulate calendar mount / period change */
  function triggerRangeUpdate(start = '2025-01-01', end = '2025-01-31') {
    const s = new Date(start + 'T00:00:00Z')
    const e = new Date(end + 'T23:59:59Z')
    mockCallbacks.onRangeUpdate?.({
      start: { epochMilliseconds: s.getTime() } as Temporal.ZonedDateTime,
      end: { epochMilliseconds: e.getTime() } as Temporal.ZonedDateTime,
    })
  }

  it('renders', async () => {
    const html = await (
      await renderSuspended(Page, {
        route: '/',
      })
    ).html()
    expect(html).toMatchSnapshot()
  })

  it('fetches calendar data when onRangeUpdate fires', async () => {
    await mount()
    triggerRangeUpdate()
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/calendars')
    })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith(
        '/api/calendar',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('calls eventsService.set with mapped events', async () => {
    await mount()
    mockEventsServiceSet.mockClear()
    triggerRangeUpdate()
    await vi.waitFor(() => {
      expect(mockEventsServiceSet).toHaveBeenCalled()
    })
    // Find the call that has actual events (skip stale empty calls)
    const callWithEvents = mockEventsServiceSet.mock.calls.find((c: unknown[][]) => c[0]?.length > 0)
    expect(callWithEvents).toBeTruthy()
    const events = callWithEvents![0]
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('Test')
    expect(events[0]._calendar).toBe('Work')
    expect(events[0].calendarId).toBe('cal-0')
  })

  it('opens modal when clicking an event', async () => {
    await mount()
    triggerRangeUpdate()
    await vi.waitFor(() => {
      expect(mockEventsServiceSet).toHaveBeenCalled()
    })
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
    const wrapper = await mount()
    triggerRangeUpdate()
    await vi.waitFor(() => {
      expect(mockEventsServiceSet).toHaveBeenCalled()
    })
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
    expect(wrapper.text()).toContain('Room A')
    expect(wrapper.text()).toContain('A test event')
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
    const wrapper = await mount()
    triggerRangeUpdate()
    await vi.waitFor(() => {
      expect(mockEventsServiceSet).toHaveBeenCalled()
    })
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
    expect(wrapper.text()).toContain('Room B')
    expect(wrapper.text()).not.toContain('A test event')
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
    const wrapper = await mount()
    triggerRangeUpdate()
    await vi.waitFor(() => {
      expect(mockEventsServiceSet).toHaveBeenCalled()
    })
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
    expect(wrapper.text()).not.toContain('Room')
    expect(wrapper.text()).toContain('Some notes')
  })

  it('handles error in clickItem gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/calendars') return Promise.resolve([])
      if (url === '/api/event') return Promise.reject(new Error('fetch failed'))
      return Promise.resolve([])
    })
    await mount()
    triggerRangeUpdate()
    await nextTick()
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
    triggerRangeUpdate()
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/calendars')
    })
    await vi.waitFor(() => {
      expect(mockCalendarControlsSetCalendars).toHaveBeenCalled()
    })
    const calendarsConfig = mockCalendarControlsSetCalendars.mock.calls[0]![0]
    expect(calendarsConfig['cal-0']).toBeDefined()
    expect(calendarsConfig['cal-0'].lightColors.main).toBe('#9a3412')
    expect(calendarsConfig['cal-0'].lightColors.container).toBe('#dfc8b4')
    expect(calendarsConfig['cal-0'].darkColors.main).toBe('#c2410c')
    expect(calendarsConfig['cal-0'].darkColors.container).toBe('#583020')
  })

  it('closes modal via handleModalX', async () => {
    const wrapper = await mount()
    triggerRangeUpdate()
    await vi.waitFor(() => {
      expect(mockEventsServiceSet).toHaveBeenCalled()
    })
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
    // Modal should be open
    expect(wrapper.find('#default-modal.modal-open').exists()).toBe(true)
    // Click the modal backdrop to trigger handleModalX
    await wrapper.find('#default-modal').trigger('click')
    await nextTick()
    // Modal should be closed
    expect(wrapper.find('#default-modal.modal-hidden').exists()).toBe(true)
  })

  it('prevents closing modal while event is loading', async () => {
    let resolveEvent!: (v: unknown) => void
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/event') return new Promise((r) => (resolveEvent = r))
      return Promise.resolve([{ name: 'Work', color: '#ea580c' }])
    })
    const wrapper = await mount()
    mockCallbacks.onEventClick?.({
      _calendar: 'Work',
      _originalId: 'event-1',
      _occurrence: 1,
      title: 'Test',
    })
    await nextTick()
    // Modal open, still loading
    expect(wrapper.find('#default-modal.modal-open').exists()).toBe(true)
    // Try to close — should be blocked
    await wrapper.find('#default-modal').trigger('click')
    await nextTick()
    expect(wrapper.find('#default-modal.modal-open').exists()).toBe(true)
    // Resolve loading, then close works
    resolveEvent({ summary: 'Test', dtstart: '2025-01-15' })
    await nextTick()
    await wrapper.find('#default-modal').trigger('click')
    await nextTick()
    expect(wrapper.find('#default-modal.modal-hidden').exists()).toBe(true)
  })

  it('skips fetching calendars when already loaded', async () => {
    await mount()
    triggerRangeUpdate()
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/calendars')
    })
    // Calendars are now loaded. Trigger another range update
    mock$fetch.mockClear()
    triggerRangeUpdate('2025-02-01', '2025-02-28')
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith(
        '/api/calendar',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    // Should NOT have fetched calendars again
    expect(mock$fetch).not.toHaveBeenCalledWith('/api/calendars')
  })

  it('handles getData error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockRejectedValue(new Error('network error'))
    await mount()
    triggerRangeUpdate()
    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })
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
    triggerRangeUpdate()
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/calendars')
    })
    await nextTick()
    const legendItems = wrapper.findAll('.cal-legend-item')
    expect(legendItems).toHaveLength(1)
    expect(legendItems[0]!.text()).toContain('Work')
    const dot = legendItems[0]!.find('.cal-legend-dot')
    expect((dot.element as HTMLElement).style.backgroundColor).toBeTruthy()
  })

  it('toggles calendar visibility via legend click', async () => {
    const wrapper = await mount()
    // Clear stale calls from previous tests before triggering our range update
    mockEventsServiceSet.mockClear()
    mock$fetch.mockClear()
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
    triggerRangeUpdate()
    // Wait for eventsService.set to be called with the 2 events
    await vi.waitFor(() => {
      const callWithEvents = mockEventsServiceSet.mock.calls.find((c: unknown[][]) => c[0]?.length === 2)
      expect(callWithEvents).toBeTruthy()
    })

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
    const wrapper = await mount()
    triggerRangeUpdate()
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
})
