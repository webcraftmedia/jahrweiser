import { describe, expect, it } from 'vitest'

import { isCalendarPath } from './calendarPath'

describe('isCalendarPath', () => {
  it.each(['/', '/2026', '/2026/10', '/2026/10/event/abc/2'])('%s is the calendar', (path) => {
    expect(isCalendarPath(path)).toBe(true)
  })

  it.each(['/karte', '/login', '/blaettchen', '/20261', '/admin/members'])('%s is not', (path) => {
    expect(isCalendarPath(path)).toBe(false)
  })
})
