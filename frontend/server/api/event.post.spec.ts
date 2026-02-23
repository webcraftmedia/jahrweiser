// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  SIMPLE_EVENT,
  EVENT_WITH_DETAILS,
  RECURRING_EVENT,
  RECURRING_EVENT_WITH_DETAILS,
} from '../../test/fixtures/ical-data'

const mockFindCalendars = vi.fn()
const mockFindEvent = vi.fn()
const mockCreateCalDAVAccount = vi.fn().mockReturnValue({ accountType: 'caldav' })

vi.mock('../helpers/dav', () => ({
  createCalDAVAccount: (...args: unknown[]) => mockCreateCalDAVAccount(...args),
  findCalendars: (...args: unknown[]) => mockFindCalendars(...args),
  findEvent: (...args: unknown[]) => mockFindEvent(...args),
}))

import handler from './event.post'

const handlerFn = handler as unknown as (event: unknown) => Promise<unknown>

describe('event.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'Test', email: 'test@example.com', role: 'user' },
    } as never)
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        calendar: 'Work',
        id: 'event-123',
      })
    })
    mockFindCalendars.mockResolvedValue([
      { displayName: 'Work', url: 'https://dav.example.com/cal/work' },
    ])
  })

  it('returns event details for simple event', async () => {
    mockFindEvent.mockResolvedValue([{ data: SIMPLE_EVENT }])
    const result = (await handlerFn({})) as Record<string, unknown>
    expect(result.summary).toBe('Test Event')
    expect(result.uid).toBe('simple-event-1')
  })

  it('returns event with description and location', async () => {
    mockFindEvent.mockResolvedValue([{ data: EVENT_WITH_DETAILS }])
    const result = (await handlerFn({})) as Record<string, unknown>
    expect(result.description).toBe('This is a detailed description')
    expect(result.location).toBe('Conference Room A')
    expect(result.summary).toBe('Detailed Event')
  })

  it('returns correct occurrence for recurring event', async () => {
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        calendar: 'Work',
        id: 'event-123',
        occurrence: 2,
      })
    })
    mockFindEvent.mockResolvedValue([{ data: RECURRING_EVENT }])
    const result = (await handlerFn({})) as Record<string, unknown>
    expect(result.summary).toBe('Weekly Meeting')
    expect(result.uid).toBe('recurring-event-1')
    // Occurrence 2 should be 1 week after start
    expect(result.startDate).toContain('2025-03-08')
  })

  it('returns description and location for recurring event with occurrence', async () => {
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        calendar: 'Work',
        id: 'event-123',
        occurrence: 1,
      })
    })
    mockFindEvent.mockResolvedValue([{ data: RECURRING_EVENT_WITH_DETAILS }])
    const result = (await handlerFn({})) as Record<string, unknown>
    expect(result.description).toBe('Weekly team sync')
    expect(result.location).toBe('Room B')
    expect(result.summary).toBe('Weekly Detailed Meeting')
  })

  it('returns non-expanded data for recurring event without occurrence', async () => {
    mockFindEvent.mockResolvedValue([{ data: RECURRING_EVENT }])
    const result = (await handlerFn({})) as Record<string, unknown>
    expect(result.summary).toBe('Weekly Meeting')
    expect(result.uid).toBe('recurring-event-1')
    // Without occurrence, should return non-expanded data
    expect(result.startDate).toBeDefined()
  })

  it('throws when calendar not found', async () => {
    mockFindCalendars.mockResolvedValue([])
    await expect(handlerFn({})).rejects.toThrow('Calendar not found')
  })

  it('throws when event not found', async () => {
    mockFindEvent.mockResolvedValue([])
    await expect(handlerFn({})).rejects.toThrow('event not found')
  })

  it('throws when no vevent in calendar data', async () => {
    const noVevent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
END:VCALENDAR`
    mockFindEvent.mockResolvedValue([{ data: noVevent }])
    await expect(handlerFn({})).rejects.toThrow('event not found')
  })
})
