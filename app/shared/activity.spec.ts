import { describe, expect, it } from 'vitest'

import { activeCounts, activityBucket, countActivity } from './activity'

const NOW = new Date('2026-10-04T12:00:00Z')

function ago(days: number, hours = 0): Date {
  return new Date(NOW.getTime() - (days * 24 + hours) * 60 * 60 * 1000)
}

describe('activityBucket', () => {
  it('calls somebody who never logged in "never", not "older"', () => {
    // Different stories: one drifted off, the other never arrived.
    expect(activityBucket(null, NOW)).toBe('never')
  })

  it.each([
    [ago(0, 3), 'day'],
    [ago(1), 'day'],
    [ago(1, 1), 'week'],
    [ago(7), 'week'],
    [ago(8), 'month'],
    [ago(30), 'month'],
    [ago(31), 'quarter'],
    [ago(90), 'quarter'],
    [ago(91), 'older'],
  ])('puts %s into %s, bounds inclusive', (moment, bucket) => {
    expect(activityBucket(moment, NOW)).toBe(bucket)
  })

  it('treats a moment slightly in the future as today — clocks drift', () => {
    expect(activityBucket(new Date(NOW.getTime() + 5000), NOW)).toBe('day')
  })
})

describe('countActivity', () => {
  it('reports every span, empty ones as zero', () => {
    expect(countActivity([], NOW)).toStrictEqual({
      day: 0,
      week: 0,
      month: 0,
      quarter: 0,
      older: 0,
      never: 0,
    })
  })

  it('counts each member once, into their span', () => {
    expect(countActivity([ago(0), ago(0, 5), ago(3), ago(200), null], NOW)).toStrictEqual({
      day: 2,
      week: 1,
      month: 0,
      quarter: 0,
      older: 1,
      never: 1,
    })
  })
})

describe('activeCounts', () => {
  it('accumulates — active this month includes active today', () => {
    expect(
      activeCounts({ day: 2, week: 3, month: 5, quarter: 7, older: 11, never: 13 }),
    ).toStrictEqual({ active1d: 2, active7d: 5, active30d: 10 })
  })
})
