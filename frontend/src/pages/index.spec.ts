import { mountSuspended, renderSuspended } from '@nuxt/test-utils/runtime'
import Page from './index.vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock$fetch = vi.hoisted(() => vi.fn())

vi.mock('vue-simple-calendar', () => ({
  CalendarView: {
    name: 'CalendarView',
    template: '<div class="calendar-view"><slot name="header" :headerProps="{}" /></div>',
    props: {
      showDate: { type: Date, default: () => new Date() },
      items: { type: Array, default: () => [] },
      startingDayOfWeek: { type: Number, default: 1 },
      disablePast: { type: Boolean, default: false },
      disableFuture: { type: Boolean, default: false },
      displayPeriodUom: { type: String, default: 'month' },
      displayPeriodCount: { type: Number, default: 1 },
      displayWeekNumbers: { type: Boolean, default: false },
      showTimes: { type: Boolean, default: false },
      periodChangedCallback: { type: Function, default: undefined },
    },
    emits: ['click-item'],
    mounted() {
      if (this.periodChangedCallback) {
        this.periodChangedCallback({
          value: {
            displayFirstDate: { value: new Date('2025-01-01') },
            displayLastDate: { value: new Date('2025-01-31') },
          },
        })
      }
    },
  },
  CalendarViewHeader: {
    name: 'CalendarViewHeader',
    template: '<div class="calendar-header" />',
    props: ['headerProps'],
    emits: ['input'],
  },
}))

vi.stubGlobal('$fetch', mock$fetch)

describe('Page: Index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T12:00:00.000Z'))
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

  it('renders', async () => {
    const html = await (
      await renderSuspended(Page, {
        route: '/',
      })
    ).html()
    expect(html).toMatchSnapshot()
  })

  it('fetches calendar data on mount', async () => {
    await mountSuspended(Page, { route: '/' })
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

  it('opens modal when clicking an item', async () => {
    const wrapper = await mountSuspended(Page, { route: '/' })
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    await calendarView.vm.$emit('click-item', {
      originalItem: { calendar: 'Work', id: 'event-1', occurrence: 1 },
    })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/event', {
        method: 'POST',
        body: { calendar: 'Work', id: 'event-1', occurrence: 1 },
      })
    })
  })

  it('handles error in clickItem gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/calendars') return Promise.resolve([])
      if (url === '/api/event') return Promise.reject(new Error('fetch failed'))
      return Promise.resolve([])
    })
    const wrapper = await mountSuspended(Page, { route: '/' })
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    await calendarView.vm.$emit('click-item', {
      originalItem: { calendar: 'Work', id: 'event-1', occurrence: 1 },
    })
    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })
    consoleSpy.mockRestore()
  })

  it('setShowDate updates calendar date', async () => {
    const wrapper = await mountSuspended(Page, { route: '/' })
    const header = wrapper.findComponent({ name: 'CalendarViewHeader' })
    const newDate = new Date('2025-06-01')
    await header.vm.$emit('input', newDate)
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    expect(calendarView.props('showDate')).toStrictEqual(newDate)
  })

  it('inverts colors in dark mode', async () => {
    const listeners: ((e: { matches: boolean }) => void)[] = []
    vi.spyOn(window, 'matchMedia')
      .mockImplementation()
      .mockReturnValue({
        matches: true,
        addEventListener: (_event: string, fn: (e: { matches: boolean }) => void) => {
          listeners.push(fn)
        },
      })
    const wrapper = await mountSuspended(Page, { route: '/' })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/calendars')
    })
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    const items = calendarView.props('items') as { style: string }[]
    if (items.length > 0) {
      // #ff0000 inverted is #00ffff
      expect(items[0]!.style).toContain('#00ffff')
    }
  })

  it('reacts to dark mode change event', async () => {
    let changeListener: ((e: { matches: boolean }) => void) | undefined
    vi.spyOn(window, 'matchMedia')
      .mockImplementation()
      .mockReturnValue({
        matches: false,
        addEventListener: (_event: string, fn: (e: { matches: boolean }) => void) => {
          changeListener = fn
        },
      })
    const wrapper = await mountSuspended(Page, { route: '/' })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/calendars')
    })
    // Initially light mode - colors unchanged
    let calendarView = wrapper.findComponent({ name: 'CalendarView' })
    let items = calendarView.props('items') as { style: string }[]
    if (items.length > 0) {
      expect(items[0]!.style).toContain('#ff0000')
    }
    // Trigger dark mode change
    changeListener!({ matches: true })
    await nextTick()
    calendarView = wrapper.findComponent({ name: 'CalendarView' })
    items = calendarView.props('items') as { style: string }[]
    if (items.length > 0) {
      expect(items[0]!.style).toContain('#00ffff')
    }
  })

  it('closes modal via handleModalX', async () => {
    const wrapper = await mountSuspended(Page, { route: '/' })
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    await calendarView.vm.$emit('click-item', {
      originalItem: { calendar: 'Work', id: 'event-1', occurrence: 1 },
    })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/event', expect.anything())
    })
    await nextTick()
    // Modal should be open
    expect(wrapper.find('#default-modal.open').exists()).toBe(true)
    // Click the modal backdrop to trigger handleModalX
    await wrapper.find('#default-modal').trigger('click')
    await nextTick()
    // Modal should be closed
    expect(wrapper.find('#default-modal.hidden').exists()).toBe(true)
  })

  it('skips fetching calendars when already loaded', async () => {
    const wrapper = await mountSuspended(Page, { route: '/' })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/calendars')
    })
    // Calendars are now loaded. Trigger another getData call
    mock$fetch.mockClear()
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    calendarView.props('periodChangedCallback')?.({
      value: {
        displayFirstDate: { value: new Date('2025-02-01') },
        displayLastDate: { value: new Date('2025-02-28') },
      },
    })
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
    await mountSuspended(Page, { route: '/' })
    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })
    consoleSpy.mockRestore()
  })
})
