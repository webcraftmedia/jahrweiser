import { describe, expect, it } from 'vitest'

import { useChangelog } from './useChangelog'

describe('useChangelog', () => {
  it('openChangelog sets shouldOpen to true', () => {
    const { openChangelog, shouldOpen } = useChangelog()
    expect(shouldOpen.value).toBe(false)
    openChangelog()
    expect(shouldOpen.value).toBe(true)
  })
})
