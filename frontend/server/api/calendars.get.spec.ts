// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import handler from './calendars.get'

const mockFindCalendars = vi.fn()
const mockCreateCalDAVAccount = vi.fn().mockReturnValue({ accountType: 'caldav' })

// Only the DAV I/O is mocked; the pure helpers (calendarKey, readCategories, ...)
// stay real, so these tests exercise the actual logic instead of a copy of it.
vi.mock('../helpers/dav', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../helpers/dav')>()),
  createCalDAVAccount: (...args: unknown[]) => mockCreateCalDAVAccount(...args),
  findCalendars: (...args: unknown[]) => mockFindCalendars(...args),
}))

const handlerFn = handler as unknown as (event: unknown) => Promise<unknown>

describe('calendars.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'Test', email: 'test@example.com', role: 'user' },
    })
  })

  it('returns calendars with color', async () => {
    mockFindCalendars.mockResolvedValue([
      { displayName: 'Work', url: 'https://dav.example.com/cal/work', calendarColor: '#ff0000' },
      {
        displayName: 'Personal',
        url: 'https://dav.example.com/cal/personal',
        calendarColor: '#00ff00',
      },
    ])
    const result = await handlerFn({})
    // `key` is the stable identity access grants are joined on; `name` is only
    // the mutable label.
    expect(result).toStrictEqual([
      { key: 'work', name: 'Work', color: '#ff0000' },
      { key: 'personal', name: 'Personal', color: '#00ff00' },
    ])
  })

  it('returns default color when calendar has no color', async () => {
    mockFindCalendars.mockResolvedValue([
      {
        displayName: 'NoColor',
        url: 'https://dav.example.com/cal/nocolor',
        calendarColor: undefined,
      },
    ])
    const result = await handlerFn({})
    expect(result).toStrictEqual([{ key: 'nocolor', name: 'NoColor', color: '#e7e7ff' }])
  })

  it('returns empty array for empty list', async () => {
    mockFindCalendars.mockResolvedValue([])
    const result = await handlerFn({})
    expect(result).toStrictEqual([])
  })
})
