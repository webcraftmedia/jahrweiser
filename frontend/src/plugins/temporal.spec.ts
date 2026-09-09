import { describe, expect, it } from 'vitest'

import plugin from './temporal'

// The plugin has no body — its whole job is the side-effect import of the
// polyfill. Calendar arithmetic across the app assumes `Temporal` is simply
// there, so what is worth asserting is that importing this module makes it so.
describe('temporal plugin', () => {
  it('puts Temporal on the global object', () => {
    expect(globalThis.Temporal).toBeDefined()
  })

  it('provides the calendar arithmetic the app relies on', () => {
    // Month lengths and month-end clamping are exactly what hand-rolled Date
    // maths gets wrong, and both drive the calendar views.
    expect(Temporal.PlainYearMonth.from('2024-02').daysInMonth).toBe(29)
    expect(Temporal.PlainDate.from('2026-01-31').add({ months: 1 }).toString()).toBe('2026-02-28')
  })

  it('registers without doing anything else', () => {
    expect((plugin as () => unknown)()).toBeUndefined()
  })
})
