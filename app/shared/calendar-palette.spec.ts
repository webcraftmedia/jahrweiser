// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { designPalette, paletteEntryForIndex, paletteMailColorForIndex } from './calendar-palette'

const HEX = /^#[0-9a-f]{6}$/

describe('paletteEntryForIndex', () => {
  it('hands out one entry per calendar, in palette order', () => {
    expect(paletteEntryForIndex(0)).toBe(designPalette[0])
    expect(paletteEntryForIndex(2)).toBe(designPalette[2])
  })

  it('wraps around instead of running out', () => {
    // More calendars than colors is normal; the two renderings only agree as
    // long as they wrap identically, which is why they both come through here.
    expect(paletteEntryForIndex(designPalette.length)).toBe(designPalette[0])
    expect(paletteEntryForIndex(designPalette.length * 3 + 1)).toBe(designPalette[1])
  })
})

describe('paletteMailColorForIndex', () => {
  it('is the mail variant of the same entry', () => {
    expect(paletteMailColorForIndex(1)).toBe(designPalette[1]!.mail)
    expect(paletteMailColorForIndex(designPalette.length + 1)).toBe(designPalette[1]!.mail)
  })
})

describe('designPalette', () => {
  // A calendar whose entry is missing a color renders an invisible event in one
  // of the two places that read this list — and in the other one it looks fine.
  it.each(designPalette.map((entry, index) => [index, entry] as const))(
    'entry %i defines every color as a hex value',
    (_index, entry) => {
      for (const value of [
        entry.light.bg,
        entry.light.border,
        entry.light.text,
        entry.dark.bg,
        entry.dark.border,
        entry.dark.text,
        entry.mail,
      ]) {
        expect(value).toMatch(HEX)
      }
    },
  )

  it('keeps the light and dark variants apart', () => {
    // Same background in both modes means the mode switch does nothing for that
    // calendar — a copy-paste slip the palette cannot show on its own.
    for (const entry of designPalette) {
      expect(entry.dark.bg).not.toBe(entry.light.bg)
      expect(entry.dark.text).not.toBe(entry.light.text)
    }
  })
})
