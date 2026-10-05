import { describe, expect, it } from 'vitest'

import { earliestVisibleDate, earliestVisibleMonth } from './calendarWindow'

describe('calendarWindow', () => {
  it('reaches back to the previous month', () => {
    expect(earliestVisibleMonth(new Date(2026, 9, 5))).toStrictEqual({ year: 2026, month: 9 })
  })

  it('crosses the year boundary', () => {
    expect(earliestVisibleMonth(new Date(2027, 0, 15))).toStrictEqual({ year: 2026, month: 12 })
  })

  it('lets a request start a week before the 1st of that month, for the grid', () => {
    expect(earliestVisibleDate(new Date(2025, 3, 1))).toStrictEqual(new Date(2025, 1, 22))
  })
})
