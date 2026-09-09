import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import Chart from './AdminTrendChart.vue'

import type { ChartSeries } from './AdminTrendChart.vue'

const LABELS = ['Jan 26', 'Feb 26', 'Mär 26', 'Apr 26']

function mount(series: ChartSeries[], derivedCount = 0) {
  return mountSuspended(Chart, {
    props: { labels: LABELS, series, derivedCount, title: 'Testreihe' },
  })
}

const MEMBERS: ChartSeries = { tone: 'members', label: 'Mitglieder', values: [10, 12, 12, 15] }
const SUBSCRIBED: ChartSeries = {
  tone: 'subscribed',
  label: 'Abos',
  values: [null, null, 8, 9],
}
const UNSUBSCRIBED: ChartSeries = {
  tone: 'unsubscribed',
  label: 'Abbestellt',
  values: [null, null, 1, 2],
}

describe('Component: AdminTrendChart', () => {
  it('names itself for a screen reader', async () => {
    const wrapper = await mount([MEMBERS])
    expect(wrapper.find('svg').attributes('aria-label')).toBe('Testreihe')
    expect(wrapper.find('svg').attributes('role')).toBe('img')
  })

  it('draws one line per series', async () => {
    const wrapper = await mount([SUBSCRIBED, UNSUBSCRIBED])
    expect(wrapper.findAll('path.line')).toHaveLength(2)
  })

  it('starts a line where its data starts instead of dropping to zero', async () => {
    // The first two months were never measured; drawing them as 0 would invent
    // an exodus that never happened.
    const wrapper = await mount([SUBSCRIBED])
    const d = wrapper.find('path.line').attributes('d') ?? ''
    // Two points for two measured months, not four.
    expect(d.match(/[ML]/g)).toHaveLength(2)
  })

  it('draws the derived span as its own dashed path', async () => {
    // Dashed, because those months are inferred from join dates rather than
    // measured — the chart must not present the two as the same thing.
    const wrapper = await mount([MEMBERS], 2)
    expect(wrapper.find('path.series-derived').exists()).toBe(true)
    expect(wrapper.findAll('path.line')).toHaveLength(2)
  })

  it('draws a single continuous line when nothing is derived', async () => {
    const wrapper = await mount([MEMBERS])
    expect(wrapper.find('path.series-derived').exists()).toBe(false)
    expect(wrapper.findAll('path.line')).toHaveLength(1)
  })

  it('carries a legend for two series and none for one', async () => {
    // With one series the title already names it; a legend box would be noise.
    expect((await mount([MEMBERS])).find('figcaption').exists()).toBe(false)
    const two = await mount([SUBSCRIBED, UNSUBSCRIBED])
    expect(two.find('figcaption').exists()).toBe(true)
    expect(two.find('figcaption').text()).toContain('Abbestellt')
  })

  it('offers the same numbers as a table for whoever cannot see the chart', async () => {
    const wrapper = await mount([SUBSCRIBED, UNSUBSCRIBED])
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(LABELS.length)
    expect(rows[2]!.text()).toContain('8')
    // Unmeasured months are marked as such, not as zero.
    expect(rows[0]!.text()).toContain('—')
  })

  it('shows a crosshair and the values of the hovered month', async () => {
    const wrapper = await mount([SUBSCRIBED, UNSUBSCRIBED])
    expect(wrapper.find('line.crosshair').exists()).toBe(false)

    await wrapper.findAll('rect')[3]!.trigger('mouseenter')
    expect(wrapper.find('line.crosshair').exists()).toBe(true)
    const tooltip = wrapper.find('[role="status"]')
    expect(tooltip.text()).toContain('Apr 26')
    expect(tooltip.text()).toContain('9')
    expect(tooltip.text()).toContain('2')
  })

  it('says so in the tooltip when a month was not measured', async () => {
    const wrapper = await mount([SUBSCRIBED])
    await wrapper.findAll('rect')[0]!.trigger('mouseenter')
    expect(wrapper.find('[role="status"]').text()).toContain('—')
  })

  it('drops the crosshair when the pointer leaves', async () => {
    const wrapper = await mount([MEMBERS])
    await wrapper.findAll('rect')[1]!.trigger('mouseenter')
    expect(wrapper.find('line.crosshair').exists()).toBe(true)
    await wrapper.find('svg').trigger('mouseleave')
    expect(wrapper.find('line.crosshair').exists()).toBe(false)
  })

  it('centres a single month instead of dividing by zero', async () => {
    // A brand-new install has exactly one measured month.
    const wrapper = await mountSuspended(Chart, {
      props: {
        labels: ['Jan 26'],
        series: [{ tone: 'members', label: 'Mitglieder', values: [7] }],
        title: 'Ein Monat',
      },
    })
    expect(wrapper.find('path.line').attributes('d')).toMatch(/^M\d/)
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
  })

  it('survives a series that is all zeroes', async () => {
    // Math.log10(0) is -Infinity; the scale has to hold anyway.
    const wrapper = await mount([{ tone: 'members', label: 'Null', values: [0, 0, 0, 0] }])
    expect(wrapper.find('path.line').attributes('d')).toContain('M')
    expect(wrapper.findAll('.axis-text text')[0]!.text()).toBe('0')
  })

  it('survives a series with no measurement at all', async () => {
    const wrapper = await mount([
      { tone: 'members', label: 'Leer', values: [null, null, null, null] },
    ])
    expect(wrapper.find('path.line').attributes('d')).toBe('')
  })
})
