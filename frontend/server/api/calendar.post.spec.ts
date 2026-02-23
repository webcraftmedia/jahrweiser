import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  SIMPLE_EVENT,
  ALLDAY_EVENT,
  RECURRING_EVENT,
  PRIVATE_EVENT,
} from '../../test/fixtures/ical-data'
import { createMockVCard } from '../../test/fixtures/vcard-data'
import handler from './calendar.post'

const mockFindCalendars = vi.fn()
const mockFindEvents = vi.fn()
const mockFindUserByEmail = vi.fn()
const mockCreateCalDAVAccount = vi.fn().mockReturnValue({ accountType: 'caldav' })
const mockCreateCardDAVAccount = vi.fn().mockReturnValue({ accountType: 'carddav' })

vi.mock('../helpers/dav', () => ({
  createCalDAVAccount: (...args: unknown[]) => mockCreateCalDAVAccount(...args),
  createCardDAVAccount: (...args: unknown[]) => mockCreateCardDAVAccount(...args),
  findCalendars: (...args: unknown[]) => mockFindCalendars(...args),
  findEvents: (...args: unknown[]) => mockFindEvents(...args),
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
}))

const handlerFn = handler as unknown as (event: unknown) => Promise<unknown>

describe('calendar.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'Test', email: 'test@example.com', role: 'user' },
    } as never)
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        calendar: 'Work',
        startDate: '2025-03-01T00:00:00Z',
        endDate: '2025-04-01T00:00:00Z',
      })
    })
    mockFindCalendars.mockResolvedValue([
      { displayName: 'Work', url: 'https://dav.example.com/cal/work', calendarColor: '#ff0000' },
    ])
    // Default: user found with categories
    mockFindUserByEmail.mockResolvedValue({
      user: { href: '/abc.vcf' },
      vcard: createMockVCard({ email: 'test@example.com', categories: ['Work'] }),
    })
  })

  it('throws when calendar not found', async () => {
    mockFindCalendars.mockResolvedValue([])
    await expect(handlerFn({})).rejects.toThrow('Calendar not found')
  })

  it('returns event array for simple event', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/simple-event-1.ics',
        props: { calendarData: SIMPLE_EVENT },
      },
    ])
    const result = (await handlerFn({})) as unknown[]
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      calendar: 'Work',
      color: '#ff0000',
      id: 'simple-event-1',
      title: 'Test Event',
    })
  })

  it('expands recurring events', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/recurring-event-1.ics',
        props: { calendarData: RECURRING_EVENT },
      },
    ])
    const result = (await handlerFn({})) as unknown[]
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0]).toMatchObject({
      title: 'Weekly Meeting',
      isRecurring: true,
    })
  })

  it('filters private events when user lacks tag', async () => {
    mockFindUserByEmail.mockResolvedValue({
      user: { href: '/abc.vcf' },
      vcard: createMockVCard({ email: 'test@example.com', categories: ['Other'] }),
    })
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/private-event-1.ics',
        props: { calendarData: PRIVATE_EVENT },
      },
    ])
    const result = (await handlerFn({})) as unknown[]
    expect(result).toHaveLength(0)
  })

  it('includes private events when user has matching tag', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/private-event-1.ics',
        props: { calendarData: PRIVATE_EVENT },
      },
    ])
    const result = (await handlerFn({})) as unknown[]
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ title: 'Private Meeting' })
  })

  it('shows private events when user not in DAV', async () => {
    mockFindUserByEmail.mockResolvedValue(false)
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/private-event-1.ics',
        props: { calendarData: PRIVATE_EVENT },
      },
    ])
    const result = (await handlerFn({})) as unknown[]
    expect(result).toHaveLength(1)
  })

  it('subtracts 1ms from endDate for all-day events', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/allday-event-1.ics',
        props: { calendarData: ALLDAY_EVENT },
      },
    ])
    const result = (await handlerFn({})) as { startDate: Date; endDate: Date }[]
    expect(result).toHaveLength(1)
    // endDate should have milliseconds = 999 (subtracted 1ms)
    expect(result[0]!.endDate.getMilliseconds()).toBe(999)
  })

  it('stops expanding recurring events past endDate', async () => {
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        calendar: 'Work',
        startDate: '2025-03-01T00:00:00Z',
        endDate: '2025-03-10T00:00:00Z',
      })
    })
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/recurring-event-1.ics',
        props: { calendarData: RECURRING_EVENT },
      },
    ])
    const result = (await handlerFn({})) as unknown[]
    // Should have events only within the date range (March 1 and March 8, but not March 15+)
    expect(result.length).toBeLessThanOrEqual(2)
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('uses default color for recurring event when calendarColor is not a string', async () => {
    mockFindCalendars.mockResolvedValue([
      { displayName: 'Work', url: 'https://dav.example.com/cal/work', calendarColor: undefined },
    ])
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/recurring-event-1.ics',
        props: { calendarData: RECURRING_EVENT },
      },
    ])
    const result = (await handlerFn({})) as { color: string }[]
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0]!.color).toBe('#e7e7ff')
  })

  it('uses default color for simple event when calendarColor is not a string', async () => {
    mockFindCalendars.mockResolvedValue([
      { displayName: 'Work', url: 'https://dav.example.com/cal/work', calendarColor: undefined },
    ])
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/simple-event-1.ics',
        props: { calendarData: SIMPLE_EVENT },
      },
    ])
    const result = (await handlerFn({})) as { color: string }[]
    expect(result).toHaveLength(1)
    expect(result[0]!.color).toBe('#e7e7ff')
  })

  it('hrefToId extracts ID from path', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/dav.php/calendars/user/work/my-event-id.ics',
        props: { calendarData: SIMPLE_EVENT },
      },
    ])
    const result = (await handlerFn({})) as { id: string }[]
    expect(result[0]!.id).toBe('my-event-id')
  })
})
