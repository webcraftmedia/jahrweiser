// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { firstNameOf } from './userName'

describe('firstNameOf', () => {
  it('returns the first word of a full name', () => {
    expect(firstNameOf('Anna Mustermann')).toBe('Anna')
  })

  it('returns a single-word name as-is', () => {
    expect(firstNameOf('Anna')).toBe('Anna')
  })

  it('collapses surrounding and inner whitespace', () => {
    expect(firstNameOf('  Anna   Maria  ')).toBe('Anna')
  })

  it('returns an empty string for blank, null or undefined', () => {
    expect(firstNameOf('   ')).toBe('')
    expect(firstNameOf(null)).toBe('')
    expect(firstNameOf(undefined)).toBe('')
  })
})
