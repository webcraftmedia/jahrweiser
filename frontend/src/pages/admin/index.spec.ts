import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Page from './index.vue'

const mock$fetch = vi.fn()
vi.stubGlobal('$fetch', mock$fetch)

const CURRENT = {
  members: 42,
  newsletterSubscribed: 37,
  newsletterUnsubscribed: 5,
  telegramChannels: 4,
  blaettchenIssues: 12,
}

/** Twelve months, the last two measured, everything before it derived. */
function months() {
  return Array.from({ length: 12 }, (_, index) => {
    const measured = index >= 10
    return {
      month: `2026-${String(index + 1).padStart(2, '0')}`,
      members: 30 + index,
      derived: !measured,
      newsletterSubscribed: 35 + index,
      newsletterUnsubscribed: index,
    }
  })
}

function serving(payload: unknown) {
  mock$fetch.mockImplementation((url: string) =>
    url === '/api/admin/metrics' ? Promise.resolve(payload) : Promise.resolve({}),
  )
}

async function mountLoaded() {
  const wrapper = await mountSuspended(Page, { route: '/admin' })
  await vi.waitFor(() => {
    expect(wrapper.find('svg').exists() || wrapper.text().includes('dashboard.error')).toBe(true)
  })
  return wrapper
}

describe('Page: Admin Übersicht', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serving({ current: CURRENT, months: months() })
  })

  it('shows the five current numbers', async () => {
    const wrapper = await mountLoaded()
    const text = wrapper.text()
    for (const value of ['42', '37', '5', '4', '12']) {
      expect(text).toContain(value)
    }
  })

  it('draws a chart for the developments and none for the small counts', async () => {
    // A line through four Telegram channels would be decoration, not information.
    const wrapper = await mountLoaded()
    expect(wrapper.findAll('svg')).toHaveLength(2)
  })

  it('marks the inferred part of the member curve and says why', async () => {
    const wrapper = await mountLoaded()
    expect(wrapper.find('path.series-derived').exists()).toBe(true)
    expect(wrapper.text()).toContain('pages.admin.dashboard.chart.derived-note')
  })

  it('draws the whole member curve dashed while nothing has been measured yet', async () => {
    // The state on the day this ships: every month is an inference.
    serving({
      current: CURRENT,
      months: months().map((month) => ({
        ...month,
        derived: true,
      })),
    })
    const wrapper = await mountLoaded()
    expect(wrapper.find('path.series-derived').exists()).toBe(true)
    // Nothing measured means no solid segment beside it.
    expect(wrapper.find('path.line:not(.series-derived)').attributes('d')).toBe('')
    expect(wrapper.text()).toContain('pages.admin.dashboard.chart.derived-note')
  })

  it('drops the note once every month has been measured', async () => {
    serving({
      current: CURRENT,
      months: months().map((month) => ({ ...month, derived: false })),
    })
    const wrapper = await mountLoaded()
    expect(wrapper.text()).not.toContain('pages.admin.dashboard.chart.derived-note')
  })

  it('marks the reconstructed span of the newsletter chart too', async () => {
    // Both series are inferred before the first measurement, so both are
    // dashed — and the note names what the reconstruction cannot see.
    const wrapper = await mountLoaded()
    expect(wrapper.findAll('path.series-derived').length).toBeGreaterThan(2)
    expect(wrapper.text()).toContain('pages.admin.dashboard.chart.newsletter-derived-note')
  })

  it('labels the months as dates rather than raw keys', async () => {
    const wrapper = await mountLoaded()
    // The axis only shows first, middle and last; the table carries all twelve.
    const rows = wrapper.findAll('table')[0]!.findAll('tbody tr')
    expect(rows).toHaveLength(12)
    expect(rows[0]!.text()).not.toContain('2026-01')
    expect(rows[0]!.text()).toMatch(/26/)
  })

  it('shows a loading state while the numbers are on their way', async () => {
    mock$fetch.mockImplementation(() => new Promise(() => {}))
    const wrapper = await mountSuspended(Page, { route: '/admin' })
    expect(wrapper.html()).toContain('loading-dot')
  })

  it('says so when the numbers cannot be loaded', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockImplementation((url: string) =>
      url === '/api/admin/metrics' ? Promise.reject(new Error('boom')) : Promise.resolve({}),
    )
    const wrapper = await mountSuspended(Page, { route: '/admin' })
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.admin.dashboard.error')
    })
    expect(wrapper.find('svg').exists()).toBe(false)
    consoleSpy.mockRestore()
  })
})
