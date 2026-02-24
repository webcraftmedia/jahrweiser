import { mountSuspended, renderSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Page from './index.vue'

const mock$fetch = vi.hoisted(() => vi.fn())

const mockColorMode = vi.hoisted(() => {
  const { ref, readonly } = require('vue')
  const isDark = ref(false)
  return {
    isDark,
    readonly,
  }
})

vi.mock('../composables/useColorMode', () => ({
  useColorMode: () => ({
    isDark: mockColorMode.readonly(mockColorMode.isDark),
    toggle: () => {
      mockColorMode.isDark.value = !mockColorMode.isDark.value
    },
  }),
}))

vi.mock('vue-simple-calendar', () => ({
  CalendarView: {
    name: 'CalendarView',
    template: '<div class="calendar-view"><slot name="header" :headerProps="{ previousPeriod: new Date(\'2024-12-01\'), currentPeriod: new Date(\'2025-01-15\'), nextPeriod: new Date(\'2025-02-01\'), periodLabel: \'January 2025\' }" /></div>',
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
    // Make rAF synchronous so triggerCalFlip inner callback executes
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
    mockColorMode.isDark.value = false
    // Clean up stale modal elements from previous tests to prevent DOM pollution
    document.querySelectorAll('#default-modal').forEach((el) => el.remove())
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

  it('renders modal content with event details', async () => {
    const wrapper = await mountSuspended(Page, { route: '/' })
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    await calendarView.vm.$emit('click-item', {
      originalItem: { calendar: 'Work', id: 'event-1', occurrence: 1 },
    })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/event', expect.anything())
    })
    await nextTick()
    await nextTick()
    // Check that modal shows event location and description
    expect(wrapper.text()).toContain('Room A')
    expect(wrapper.text()).toContain('A test event')
  })

  it('renders modal content without description', async () => {
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/calendars') return Promise.resolve([{ name: 'Work', color: '#ff0000' }])
      if (url === '/api/calendar') return Promise.resolve([{ id: 'e1', title: 'T', color: '#ff0000', startDate: '2025-01-15', endDate: '2025-01-15' }])
      if (url === '/api/event') return Promise.resolve({ summary: 'No Desc', startDate: '2025-01-15', duration: 'PT1H', location: 'Room B' })
      return Promise.resolve({})
    })
    const wrapper = await mountSuspended(Page, { route: '/' })
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    await calendarView.vm.$emit('click-item', {
      originalItem: { calendar: 'Work', id: 'e1', occurrence: 1 },
    })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/event', expect.anything())
    })
    await nextTick()
    await nextTick()
    expect(wrapper.text()).toContain('Room B')
    // No description section
    expect(wrapper.text()).not.toContain('A test event')
  })

  it('renders modal content without location', async () => {
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/calendars') return Promise.resolve([{ name: 'Work', color: '#ff0000' }])
      if (url === '/api/calendar') return Promise.resolve([{ id: 'e1', title: 'T', color: '#ff0000', startDate: '2025-01-15', endDate: '2025-01-15' }])
      if (url === '/api/event') return Promise.resolve({ summary: 'No Loc', startDate: '2025-01-15', duration: 'PT1H', description: 'Some notes' })
      return Promise.resolve({})
    })
    const wrapper = await mountSuspended(Page, { route: '/' })
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    await calendarView.vm.$emit('click-item', {
      originalItem: { calendar: 'Work', id: 'e1', occurrence: 1 },
    })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/event', expect.anything())
    })
    await nextTick()
    await nextTick()
    // No location row
    expect(wrapper.text()).not.toContain('Room')
    // Description should be shown
    expect(wrapper.text()).toContain('Some notes')
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

  it('setShowDate updates calendar date via nav button', async () => {
    const wrapper = await mountSuspended(Page, { route: '/' })
    // Click the "next" button in the custom header
    const navButtons = wrapper.findAll('.cv-header-nav button')
    const nextButton = navButtons[2]! // ‹, today, ›
    await nextButton.trigger('click')
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    expect(calendarView.props('showDate')).toStrictEqual(new Date('2025-02-01'))
  })

  it('applies design palette colors to calendar items', async () => {
    const wrapper = await mountSuspended(Page, { route: '/' })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/calendars')
    })
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    const items = calendarView.props('items') as { style: string }[]
    if (items.length > 0) {
      // Light palette sienna: bg=#dfc8b4, border=#9a3412
      expect(items[0]!.style).toContain('#dfc8b4')
      expect(items[0]!.style).toContain('#9a3412')
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
    expect(wrapper.find('#default-modal.modal-open').exists()).toBe(true)
    // Click the modal backdrop to trigger handleModalX
    await wrapper.find('#default-modal').trigger('click')
    await nextTick()
    // Modal should be closed
    expect(wrapper.find('#default-modal.modal-hidden').exists()).toBe(true)
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

  it('navigates via previous button', async () => {
    const wrapper = await mountSuspended(Page, { route: '/' })
    const navButtons = wrapper.findAll('.cv-header-nav button')
    const prevButton = navButtons[0]!
    await prevButton.trigger('click')
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    expect(calendarView.props('showDate')).toStrictEqual(new Date('2024-12-01'))
  })

  it('navigates via today button', async () => {
    const wrapper = await mountSuspended(Page, { route: '/' })
    const navButtons = wrapper.findAll('.cv-header-nav button')
    const todayButton = navButtons[1]!
    await todayButton.trigger('click')
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    expect(calendarView.props('showDate')).toStrictEqual(new Date('2025-01-15'))
  })

  it('handles keyboard navigation ArrowRight', async () => {
    const wrapper = await mountSuspended(Page, { route: '/' })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await nextTick()
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    // showDate should have advanced to next month (Feb 2025)
    expect(calendarView.props('showDate').getMonth()).toBe(1) // February
  })

  it('handles keyboard navigation with a key', async () => {
    const wrapper = await mountSuspended(Page, { route: '/' })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    await nextTick()
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    // 'a' navigates to previous month (Dec 2024)
    expect(calendarView.props('showDate').getMonth()).toBe(11) // December
  })

  it('ignores keyboard when modal is open', async () => {
    const wrapper = await mountSuspended(Page, { route: '/' })
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    await calendarView.vm.$emit('click-item', {
      originalItem: { calendar: 'Work', id: 'event-1', occurrence: 1 },
    })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/event', expect.anything())
    })
    await nextTick()
    // Verify modal is open in component tree
    expect(wrapper.find('#default-modal.modal-open').exists()).toBe(true)
    // Add modal element to global DOM so isModalOpen() can find it
    const fakeModal = document.createElement('div')
    fakeModal.id = 'default-modal'
    fakeModal.classList.add('modal-open')
    document.body.appendChild(fakeModal)
    const dateBefore = calendarView.props('showDate')
    // Keyboard should be ignored when modal is open
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await nextTick()
    // showDate should NOT have changed
    expect(calendarView.props('showDate')).toStrictEqual(dateBefore)
    document.body.removeChild(fakeModal)
  })

  it('cleans up keyboard listener on unmount', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const wrapper = await mountSuspended(Page, { route: '/' })
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    removeSpy.mockRestore()
  })

  it('staggers cv-item animations after data load', async () => {
    // Add cv-item elements to the DOM so staggerItems finds them
    const container = document.createElement('div')
    const item1 = document.createElement('div')
    item1.classList.add('cv-item')
    const item2 = document.createElement('div')
    item2.classList.add('cv-item')
    container.append(item1, item2)
    document.body.appendChild(container)

    await mountSuspended(Page, { route: '/' })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith(
        '/api/calendar',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    // After getData completes and nextTick, staggerItems should have run
    await nextTick()
    await nextTick()
    expect(item1.classList.contains('item-pop')).toBe(true)
    expect(item2.style.animationDelay).toBe('30ms')

    document.body.removeChild(container)
  })

  it('applies dark palette colors when isDark is true', async () => {
    mockColorMode.isDark.value = true
    const wrapper = await mountSuspended(Page, { route: '/' })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/calendars')
    })
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    const items = calendarView.props('items') as { style: string }[]
    if (items.length > 0) {
      // Dark palette sienna: bg=#583020, border=#c2410c
      expect(items[0]!.style).toContain('#583020')
      expect(items[0]!.style).toContain('#c2410c')
    }
  })

  it('uses fallback palette for unknown calendar colors', async () => {
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/calendars') return Promise.resolve([{ name: 'Work', color: '#ff0000' }])
      if (url === '/api/calendar') return Promise.resolve([
        { id: 'e1', title: 'Unknown', color: '#999999', startDate: '2025-01-15', endDate: '2025-01-15' },
      ])
      return Promise.resolve({})
    })
    const wrapper = await mountSuspended(Page, { route: '/' })
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/calendars')
    })
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    const items = calendarView.props('items') as { style: string }[]
    // Should use designPalette[0] (sienna) as fallback
    expect(items.length).toBeGreaterThan(0)
    expect(items[0]!.style).toContain('#dfc8b4')
    expect(items[0]!.style).toContain('#9a3412')
  })

  it('handles ArrowLeft keyboard navigation', async () => {
    const wrapper = await mountSuspended(Page, { route: '/' })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await nextTick()
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    expect(calendarView.props('showDate').getMonth()).toBe(11) // December 2024
  })

  it('handles d key keyboard navigation', async () => {
    const wrapper = await mountSuspended(Page, { route: '/' })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }))
    await nextTick()
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    expect(calendarView.props('showDate').getMonth()).toBe(1) // February 2025
  })

  it('ignores unhandled keyboard keys', async () => {
    const wrapper = await mountSuspended(Page, { route: '/' })
    const calendarView = wrapper.findComponent({ name: 'CalendarView' })
    const dateBefore = calendarView.props('showDate')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }))
    await nextTick()
    expect(calendarView.props('showDate')).toStrictEqual(dateBefore)
  })

  it('shows loading overlay during data fetch', async () => {
    let resolveCalendars!: (value: unknown) => void
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/calendars') {
        return new Promise((resolve) => { resolveCalendars = resolve })
      }
      return Promise.resolve([])
    })
    const wrapper = await mountSuspended(Page, { route: '/' })
    await nextTick()
    // Loading overlay should be visible while fetch is pending (v-show)
    const overlay = wrapper.find('.cal-loading-overlay')
    expect(overlay.exists()).toBe(true)
    // v-show: no display:none style when visible
    expect((overlay.element as HTMLElement).style.display).not.toBe('none')
    // Resolve the fetch
    resolveCalendars([{ name: 'Work', color: '#ff0000' }])
    await vi.waitFor(() => {
      // After loading completes, v-show hides with display:none
      expect((wrapper.find('.cal-loading-overlay').element as HTMLElement).style.display).toBe('none')
    })
  })
})
