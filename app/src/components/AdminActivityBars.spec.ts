import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import Bars from './AdminActivityBars.vue'

import type { ActivityCounts } from '~~/shared/activity'

const COUNTS: ActivityCounts = { day: 4, week: 6, month: 10, quarter: 5, older: 0, never: 15 }

function mount(counts: ActivityCounts = COUNTS) {
  return mountSuspended(Bars, { props: { counts, title: 'Aktivität' } })
}

describe('Component: AdminActivityBars', () => {
  it('names itself for a screen reader', async () => {
    const wrapper = await mount()
    expect(wrapper.find('[role="img"]').attributes('aria-label')).toBe('Aktivität')
  })

  it('draws one bar per span, fresh to stale, never last', async () => {
    const wrapper = await mount()
    const labels = wrapper.findAll('table tbody th').map((cell) => cell.text())
    expect(labels).toStrictEqual([
      'pages.admin.activity.day',
      'pages.admin.activity.week',
      'pages.admin.activity.month',
      'pages.admin.activity.quarter',
      'pages.admin.activity.older',
      'pages.admin.activity.never',
    ])
    expect(wrapper.findAll('.bar')).toHaveLength(6)
  })

  it('scales the bars to the largest span', async () => {
    const wrapper = await mount()
    const widths = wrapper.findAll('.bar').map((bar) => bar.attributes('style'))
    expect(widths[5]).toContain('width: 100%')
    expect(widths[0]).toContain('width: 26.6')
    // An empty span keeps its row — a missing bar would read as "not measured".
    expect(widths[4]).toContain('width: 0%')
  })

  it('labels every bar with its count and share', async () => {
    const wrapper = await mount()
    expect(wrapper.text()).toContain('10 · 25 %')
    expect(wrapper.text()).toContain('15 · 38 %')
  })

  it('sets "never logged in" apart from the recency scale', async () => {
    const wrapper = await mount()
    const bars = wrapper.findAll('.bar')
    expect(bars[5]!.classes()).toContain('bar-neutral')
    expect(bars.slice(0, 5).every((bar) => bar.classes().includes('bar-recency'))).toBe(true)
  })

  it('copes with nobody at all', async () => {
    const wrapper = await mount({ day: 0, week: 0, month: 0, quarter: 0, older: 0, never: 0 })
    expect(wrapper.text()).toContain('0 · 0 %')
    expect(wrapper.text()).not.toContain('NaN')
  })
})
