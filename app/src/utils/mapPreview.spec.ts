import { describe, expect, it } from 'vitest'

import { previewAreas } from './mapPreview'

const OUTLINE = { viewBox: '0 0 4000 5000', d: 'M0 0z' }

describe('previewAreas', () => {
  it('scales the fixed points into the coordinate system of the map', () => {
    const areas = previewAreas(OUTLINE)
    expect(areas.length).toBeGreaterThan(8)
    for (const area of areas) {
      expect(area.cx).toBeGreaterThanOrEqual(0)
      expect(area.cx).toBeLessThanOrEqual(4000)
      expect(area.cy).toBeGreaterThanOrEqual(0)
      expect(area.cy).toBeLessThanOrEqual(5000)
      expect(area.count).toBeGreaterThan(0)
    }
  })

  it('carries no geometry — the preview draws dots on the silhouette', () => {
    expect(previewAreas(OUTLINE).every((area) => area.d === '' && area.size === 0)).toBe(true)
  })

  it('is the same every time, so the preview does not shimmer', () => {
    expect(previewAreas(OUTLINE)).toStrictEqual(previewAreas(OUTLINE))
  })

  it.each([
    ['the silhouette has not arrived yet', null],
    ['its viewBox is unreadable', { viewBox: '', d: '' }],
  ])('falls back to a unit box when %s', (_case, outline) => {
    // Only reached in the instant before the silhouette resolves; it must not
    // throw, and the numbers it produces are never shown at that size.
    const areas = previewAreas(outline)
    expect(areas).toHaveLength(previewAreas(OUTLINE).length)
    expect(areas.every((area) => area.cx <= 1 && area.cy <= 1)).toBe(true)
  })

  it('uses keys that cannot be mistaken for a postal code', () => {
    // Nothing reads them — but a real-looking code in a made-up data set is a
    // trap waiting for the next person who debugs this.
    expect(previewAreas(OUTLINE).every((area) => area.plz.startsWith('preview-'))).toBe(true)
  })
})
