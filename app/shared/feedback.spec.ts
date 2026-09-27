import { describe, expect, it } from 'vitest'

import { LOCAL_DATE_TIME_PATTERN, formatLocalDateTime, shiftLocalDateTime } from './feedback'

describe('LOCAL_DATE_TIME_PATTERN', () => {
  it('accepts what a datetime-local input produces', () => {
    expect(LOCAL_DATE_TIME_PATTERN.test('2026-10-05T19:30')).toBe(true)
  })

  it.each([
    ['with seconds', '2026-10-05T19:30:00'],
    ['with a zone', '2026-10-05T19:30Z'],
    ['date only', '2026-10-05'],
    ['single-digit month', '2026-1-05T19:30'],
    ['empty', ''],
  ])('rejects %s', (_case, value) => {
    expect(LOCAL_DATE_TIME_PATTERN.test(value)).toBe(false)
  })

  it('sorts chronologically as plain text — that is what the range check relies on', () => {
    // Both the form and the zod schema compare start and end with `<=`. That is
    // only allowed to be this cheap because these strings sort like their dates.
    const values: string[] = [
      '2027-01-01T00:00',
      '2026-10-05T21:00',
      '2026-12-31T23:59',
      '2026-10-05T19:30',
      '2026-10-06T08:00',
    ]
    expect([...values].sort()).toStrictEqual([
      '2026-10-05T19:30',
      '2026-10-05T21:00',
      '2026-10-06T08:00',
      '2026-12-31T23:59',
      '2027-01-01T00:00',
    ])
  })
})

describe('formatLocalDateTime', () => {
  it('turns the input value into a German date and time', () => {
    expect(formatLocalDateTime('2026-10-05T19:30')).toBe('05.10.2026, 19:30')
  })

  it('keeps midnight as a time instead of dropping it', () => {
    expect(formatLocalDateTime('2027-01-01T00:00')).toBe('01.01.2027, 00:00')
  })

  it('hands anything unexpected back untouched', () => {
    // The endpoint validates before formatting, so this only ever guards
    // against a future caller that forgets to.
    expect(formatLocalDateTime('irgendwann')).toBe('irgendwann')
  })
})

describe('shiftLocalDateTime', () => {
  it('adds whole hours', () => {
    expect(shiftLocalDateTime('2026-10-05T19:30', 2)).toBe('2026-10-05T21:30')
  })

  it('rolls over into the next day, month and year', () => {
    expect(shiftLocalDateTime('2026-10-05T23:30', 2)).toBe('2026-10-06T01:30')
    expect(shiftLocalDateTime('2026-10-31T23:00', 2)).toBe('2026-11-01T01:00')
    expect(shiftLocalDateTime('2026-12-31T23:00', 2)).toBe('2027-01-01T01:00')
  })

  it('does not shift by the DST offset on a clock-change night', () => {
    // 2026-10-25 is the European autumn change. Two hours after 01:30 is 03:30
    // in wall-clock terms, and wall-clock is all these strings ever mean.
    expect(shiftLocalDateTime('2026-10-25T01:30', 2)).toBe('2026-10-25T03:30')
    // …and the spring one, 2027-03-28.
    expect(shiftLocalDateTime('2027-03-28T01:30', 2)).toBe('2027-03-28T03:30')
  })

  it('can shift backwards', () => {
    expect(shiftLocalDateTime('2026-10-05T00:30', -2)).toBe('2026-10-04T22:30')
  })

  it('hands anything unexpected back untouched', () => {
    expect(shiftLocalDateTime('', 2)).toBe('')
  })
})
