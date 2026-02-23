// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DAVResponse } from 'tsdav'
import ICAL from 'ical.js'
import { createMockVCard } from '../../test/fixtures/vcard-data'

vi.mock('tsdav', () => ({
  addressBookQuery: vi.fn(),
  calendarQuery: vi.fn(),
  createVCard: vi.fn(),
  DAVNamespaceShort: { DAV: 'd', CALDAV: 'c', CARDDAV: 'card' },
  fetchCalendarObjects: vi.fn(),
  fetchCalendars: vi.fn(),
  updateVCard: vi.fn(),
}))

import {
  createCalDAVAccount,
  createCardDAVAccount,
  headers,
  findCalendars,
  findEvents,
  findEvent,
  findUserByEmail,
  findUserByToken,
  saveUser,
  createUser,
  X_LOGIN_REQUEST_TIME,
  X_LOGIN_TOKEN,
  X_LOGIN_TIME,
  X_LOGIN_DISABLED,
  X_ROLE,
  X_ADMIN_TAGS,
} from './dav'
import {
  addressBookQuery,
  calendarQuery,
  fetchCalendarObjects,
  fetchCalendars as tsdavFetchCalendars,
  updateVCard,
  createVCard as tsdavCreateVCard,
} from 'tsdav'

const config = {
  DAV_USERNAME: 'testuser',
  DAV_PASSWORD: 'testpass',
  DAV_URL: 'https://dav.example.com',
  DAV_URL_CARD: 'https://dav.example.com/card',
}

describe('dav helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('X_* constants', () => {
    it('has correct constant values', () => {
      expect(X_LOGIN_REQUEST_TIME).toBe('x-login-request-time')
      expect(X_LOGIN_TOKEN).toBe('x-login-token')
      expect(X_LOGIN_TIME).toBe('x-login-time')
      expect(X_LOGIN_DISABLED).toBe('x-login-disabled')
      expect(X_ROLE).toBe('x-role')
      expect(X_ADMIN_TAGS).toBe('x-admin-tags')
    })
  })

  describe('createCalDAVAccount', () => {
    it('builds correct DAVAccount object', () => {
      const account = createCalDAVAccount(config)
      expect(account).toEqual({
        accountType: 'caldav',
        serverUrl: 'https://dav.example.com',
        credentials: { username: 'testuser', password: 'testpass' },
        rootUrl: 'https://dav.example.com/dav.php/',
        homeUrl: 'https://dav.example.com/dav.php/calendars/testuser/',
      })
    })
  })

  describe('createCardDAVAccount', () => {
    it('builds correct DAVAccount object', () => {
      const account = createCardDAVAccount(config)
      expect(account).toEqual({
        accountType: 'carddav',
        serverUrl: 'https://dav.example.com',
        credentials: { username: 'testuser', password: 'testpass' },
        rootUrl: 'https://dav.example.com/dav.php/',
        homeUrl: 'https://dav.example.com/dav.php/addressbooks/testuser/default/',
      })
    })
  })

  describe('headers', () => {
    it('returns correct Basic auth header', () => {
      const account = createCalDAVAccount(config)
      const result = headers(account)
      const expected = 'Basic ' + btoa('testuser:testpass')
      expect(result).toEqual({ authorization: expected })
    })

    it('handles missing credentials', () => {
      const account = createCalDAVAccount(config)
      account.credentials = undefined
      const result = headers(account)
      expect(result.authorization).toBe('Basic ' + btoa(':'))
    })
  })

  describe('findCalendars', () => {
    it('calls fetchCalendars with account and headers', async () => {
      vi.mocked(tsdavFetchCalendars).mockResolvedValue([])
      const account = createCalDAVAccount(config)
      await findCalendars(account)
      expect(tsdavFetchCalendars).toHaveBeenCalledWith({
        account,
        headers: headers(account),
      })
    })
  })

  describe('findEvents', () => {
    it('calls calendarQuery with filter and timeout', async () => {
      vi.mocked(calendarQuery).mockResolvedValue([])
      const account = createCalDAVAccount(config)
      const from = new Date('2025-03-01T00:00:00Z')
      const to = new Date('2025-03-31T23:59:59Z')
      await findEvents(account, 'https://dav.example.com/cal/1', from, to)
      expect(calendarQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://dav.example.com/cal/1',
          depth: '1',
          headers: headers(account),
        }),
      )
    })

    it('passes fetchOptions with agent that selects http/https agent', async () => {
      vi.mocked(calendarQuery).mockResolvedValue([])
      const account = createCalDAVAccount(config)
      const from = new Date('2025-03-01T00:00:00Z')
      const to = new Date('2025-03-31T23:59:59Z')
      await findEvents(account, 'https://dav.example.com/cal/1', from, to)
      const callArgs = vi.mocked(calendarQuery).mock.calls[0]![0] as Record<string, unknown>
      const fetchOptions = callArgs.fetchOptions as { agent: (url: URL) => unknown; signal: unknown }
      expect(fetchOptions.signal).toBeDefined()
      expect(typeof fetchOptions.agent).toBe('function')
      // Test HTTP agent selection
      const httpResult = fetchOptions.agent(new URL('http://example.com'))
      expect(httpResult).toBeDefined()
      // Test HTTPS agent selection
      const httpsResult = fetchOptions.agent(new URL('https://example.com'))
      expect(httpsResult).toBeDefined()
      expect(httpResult).not.toBe(httpsResult)
    })
  })

  describe('findEvent', () => {
    it('calls fetchCalendarObjects with URL and ID', async () => {
      vi.mocked(fetchCalendarObjects).mockResolvedValue([])
      const account = createCalDAVAccount(config)
      await findEvent(account, 'https://dav.example.com/cal/1', 'event-123')
      expect(fetchCalendarObjects).toHaveBeenCalledWith(
        expect.objectContaining({
          calendar: { url: 'https://dav.example.com/cal/1' },
          objectUrls: ['event-123.ics'],
          headers: headers(account),
        }),
      )
    })
  })

  describe('findUserByEmail', () => {
    it('returns user and vcard when found', async () => {
      const vcard = createMockVCard({ email: 'test@example.com', fn: 'Test User' })
      const mockUser: DAVResponse = {
        href: '/addressbooks/testuser/default/abc.vcf',
        ok: true,
        status: 200,
        statusText: 'OK',
        props: { addressData: vcard.toString(), getetag: '"etag123"' },
      }
      vi.mocked(addressBookQuery).mockResolvedValue([mockUser])
      const account = createCardDAVAccount(config)
      const result = await findUserByEmail(account, 'test@example.com')
      expect(result).not.toBe(false)
      if (result) {
        expect(result.user).toBe(mockUser)
        expect(result.vcard).toBeInstanceOf(ICAL.Component)
      }
    })

    it('returns false when not found', async () => {
      vi.mocked(addressBookQuery).mockResolvedValue([])
      const account = createCardDAVAccount(config)
      const result = await findUserByEmail(account, 'notfound@example.com')
      expect(result).toBe(false)
    })
  })

  describe('findUserByToken', () => {
    it('returns user and vcard when found', async () => {
      const vcard = createMockVCard({ email: 'test@example.com', token: 'abc-token' })
      const mockUser: DAVResponse = {
        href: '/addressbooks/testuser/default/abc.vcf',
        ok: true,
        status: 200,
        statusText: 'OK',
        props: { addressData: vcard.toString(), getetag: '"etag123"' },
      }
      vi.mocked(addressBookQuery).mockResolvedValue([mockUser])
      const account = createCardDAVAccount(config)
      const result = await findUserByToken(account, 'abc-token')
      expect(result).not.toBe(false)
      if (result) {
        expect(result.user).toBe(mockUser)
        expect(result.vcard).toBeInstanceOf(ICAL.Component)
      }
    })

    it('returns false when not found', async () => {
      vi.mocked(addressBookQuery).mockResolvedValue([])
      const account = createCardDAVAccount(config)
      const result = await findUserByToken(account, 'bad-token')
      expect(result).toBe(false)
    })
  })

  describe('saveUser', () => {
    it('calls updateVCard with correct parameters', async () => {
      vi.mocked(updateVCard).mockResolvedValue({} as never)
      const account = createCardDAVAccount(config)
      const vcard = createMockVCard({ email: 'test@example.com' })
      const user: DAVResponse = {
        href: '/addressbooks/testuser/default/abc.vcf',
        ok: true,
        status: 200,
        statusText: 'OK',
        props: { getetag: '"etag123"' },
      }
      await saveUser(account, user, vcard)
      expect(updateVCard).toHaveBeenCalledWith(
        expect.objectContaining({
          vCard: {
            url: 'https://dav.example.com/addressbooks/testuser/default/abc.vcf',
            data: vcard,
            etag: '"etag123"',
          },
          headers: headers(account),
        }),
      )
    })
  })

  describe('createUser', () => {
    it('calls createVCard with hash filename', async () => {
      vi.mocked(tsdavCreateVCard).mockResolvedValue({} as never)
      const account = createCardDAVAccount(config)
      const vcard = createMockVCard({ email: 'new@example.com' })
      await createUser(account, vcard)
      expect(tsdavCreateVCard).toHaveBeenCalledWith(
        expect.objectContaining({
          addressBook: {
            url: 'https://dav.example.com/dav.php/addressbooks/testuser/default/',
          },
          filename: expect.stringMatching(/^[a-f0-9]{64}\.vcf$/),
          vCardString: vcard.toString(),
          headers: headers(account),
        }),
      )
    })
  })
})
