import { describe, expect, it } from 'vitest'

import { COARSE_TOLERANCE, MEDIUM_TOLERANCE, resolutionFor } from './map'

describe('resolutionFor', () => {
  // The one rule, and both sides of the wire run it: send the coarsest copy
  // whose error is still under a pixel. Each threshold is its own tolerance,
  // because a copy simplified to `t` units strays at most `t` units — so at
  // more than `t` units per pixel there is nothing left to see.
  it.each([
    // perPixel, resolution, what the map is doing there
    [30, 'coarse', 'the whole country on a phone'] as const,
    [5, 'coarse', 'a wide desktop view'],
    [3.7, 'medium', 'the scale the Kreis layer fades in at'],
    [2.3, 'medium', 'about 180 km across'],
    [1.4, 'medium', 'about 110 km across'],
    [0.9, 'fine', 'a town'],
    [0.1, 'fine', 'the deepest zoom the map allows'],
  ])('sends the %s copy at %s units per pixel (%s)', (perPixel, resolution) => {
    expect(resolutionFor(perPixel)).toBe(resolution)
  })

  it('switches exactly at each tolerance, not a hair before', () => {
    // At exactly the tolerance the error is a whole pixel, which is a pixel too
    // many — so the boundary belongs to the finer copy on both steps.
    expect(resolutionFor(COARSE_TOLERANCE)).toBe('medium')
    expect(resolutionFor(COARSE_TOLERANCE + 0.01)).toBe('coarse')
    expect(resolutionFor(MEDIUM_TOLERANCE)).toBe('fine')
    expect(resolutionFor(MEDIUM_TOLERANCE + 0.01)).toBe('medium')
  })

  it('answers for a map that has not been measured yet', () => {
    // The client sends 0 before its first ResizeObserver callback, and a view
    // that claims no scale must get the copy that is right at any scale.
    expect(resolutionFor(0)).toBe('fine')
  })

  it('keeps the stages in order', () => {
    // Guards the pair of numbers rather than the function: a medium tolerance
    // above the coarse one would make the middle stage unreachable, and every
    // test above would still pass.
    expect(MEDIUM_TOLERANCE).toBeGreaterThan(0)
    expect(MEDIUM_TOLERANCE).toBeLessThan(COARSE_TOLERANCE)
  })
})
