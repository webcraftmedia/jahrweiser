import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import handler from './calendars.get'

const mockFindCalendars = vi.fn()
const mockCreateCalDAVAccount = vi.fn().mockReturnValue({ accountType: 'caldav' })

vi.mock('../helpers/dav', () => ({
  createCalDAVAccount: (...args: unknown[]) => mockCreateCalDAVAccount(...args),
  findCalendars: (...args: unknown[]) => mockFindCalendars(...args),
}))

const handlerFn = handler as unknown as (event: unknown) => Promise<unknown>

describe('calendars.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'Test', email: 'test@example.com', role: 'user' },
    } as never)
  })

  it('returns calendars with color', async () => {
    mockFindCalendars.mockResolvedValue([
      { displayName: 'Work', calendarColor: '#ff0000' },
      { displayName: 'Personal', calendarColor: '#00ff00' },
    ])
    const result = await handlerFn({})
    expect(result).toEqual([
      { name: 'Work', color: '#ff0000' },
      { name: 'Personal', color: '#00ff00' },
    ])
  })

  it('returns default color when calendar has no color', async () => {
    mockFindCalendars.mockResolvedValue([{ displayName: 'NoColor', calendarColor: undefined }])
    const result = await handlerFn({})
    expect(result).toEqual([{ name: 'NoColor', color: '#e7e7ff' }])
  })

  it('returns empty array for empty list', async () => {
    mockFindCalendars.mockResolvedValue([])
    const result = await handlerFn({})
    expect(result).toEqual([])
  })
})
