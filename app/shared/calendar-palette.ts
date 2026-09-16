/**
 * One color per calendar — assigned by the calendar's index in the list
 * returned by CalDAV `findCalendars`. Shared between the in-app calendar view
 * (`src/pages/index.vue`) and the weekly newsletter
 * (`server/helpers/newsletter.ts`) so both renderings agree on which color
 * belongs to which calendar.
 *
 * Stability: as long as both consumers iterate the same `findCalendars()`
 * result, indexes match and so do colors.
 */

export interface CalendarPaletteEntry {
  light: { bg: string; border: string; text: string }
  dark: { bg: string; border: string; text: string }
  /**
   * Higher-contrast, more saturated variant used in the weekly newsletter
   * (border-left of each event card). The in-app calendar view uses the
   * muted `light.border` instead — keeping both side-by-side here so the
   * calendar identity (= index in this list) stays linked across renderings.
   */
  mail: string
}

export const designPalette: readonly CalendarPaletteEntry[] = [
  {
    light: { bg: '#dfc8b4', border: '#9a3412', text: '#1e293b' },
    dark: { bg: '#583020', border: '#c2410c', text: '#e8ddd0' },
    mail: '#ea580c',
  }, // sienna → vivid orange
  {
    light: { bg: '#c8bdd6', border: '#6b21a8', text: '#1e293b' },
    dark: { bg: '#3e2260', border: '#7e22ce', text: '#e8ddd0' },
    mail: '#9333ea',
  }, // plum → vivid violet
  {
    light: { bg: '#d4b4b4', border: '#9f1239', text: '#1e293b' },
    dark: { bg: '#5c1a2a', border: '#e11d48', text: '#e8ddd0' },
    mail: '#10b981',
  }, // rose (app) / emerald (mail) — picked apart from sienna's warm orange
  {
    light: { bg: '#b4c8d8', border: '#1e5a8a', text: '#1e293b' },
    dark: { bg: '#1c3a54', border: '#3b82f6', text: '#e8ddd0' },
    mail: '#2563eb',
  }, // steel → vivid blue
  {
    light: { bg: '#c4c8cc', border: '#475569', text: '#1e293b' },
    dark: { bg: '#2e3440', border: '#94a3b8', text: '#e8ddd0' },
    mail: '#475569',
  }, // slate → keep neutral
  {
    light: { bg: '#b8d0b4', border: '#2d6a30', text: '#1e293b' },
    dark: { bg: '#1e3e20', border: '#4ade80', text: '#e8ddd0' },
    mail: '#16a34a',
  }, // forest → vivid green
  {
    light: { bg: '#c5d0a6', border: '#4d7c0f', text: '#1e293b' },
    dark: { bg: '#344818', border: '#65a30d', text: '#e8ddd0' },
    mail: '#84cc16',
  }, // olive → bright lime
  {
    light: { bg: '#ddd0a6', border: '#b45309', text: '#1e293b' },
    dark: { bg: '#5c4418', border: '#d97706', text: '#e8ddd0' },
    mail: '#f59e0b',
  }, // mustard → amber
  {
    light: { bg: '#adc8c4', border: '#0f766e', text: '#1e293b' },
    dark: { bg: '#184844', border: '#0d9488', text: '#e8ddd0' },
    mail: '#06b6d4',
  }, // craft → vivid cyan
  {
    light: { bg: '#d8c4a4', border: '#78591a', text: '#1e293b' },
    dark: { bg: '#4a3818', border: '#a57c2a', text: '#e8ddd0' },
    mail: '#ca8a04',
  }, // bronze → warm gold
  {
    light: { bg: '#d0bcc8', border: '#8a2060', text: '#1e293b' },
    dark: { bg: '#502040', border: '#c026a0', text: '#e8ddd0' },
    mail: '#db2777',
  }, // magenta → vivid pink
  {
    light: { bg: '#d8c0c0', border: '#7a3030', text: '#1e293b' },
    dark: { bg: '#4a2020', border: '#b44040', text: '#e8ddd0' },
    mail: '#dc2626',
  }, // brick → bright red
]

export function paletteEntryForIndex(index: number): CalendarPaletteEntry {
  return designPalette[index % designPalette.length]!
}

/** Light-mode border color used by the in-app calendar view. */
export function paletteBorderForIndex(index: number): string {
  return paletteEntryForIndex(index).light.border
}

/** Higher-contrast border color used in the weekly newsletter mail. */
export function paletteMailColorForIndex(index: number): string {
  return paletteEntryForIndex(index).mail
}
