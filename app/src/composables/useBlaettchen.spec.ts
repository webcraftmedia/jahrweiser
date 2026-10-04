import { describe, expect, it, vi, beforeEach } from 'vitest'

import { stubApi } from '../../test/helpers/stub-api'

import { useBlaettchen } from './useBlaettchen'

const mock$fetch = vi.fn()
stubApi(mock$fetch)

const LISTING = {
  issues: [{ number: 12, date: '2026-05-01', file: '12_2026-05-01.pdf' }],
  contact: 'redaktion@example.com',
}

describe('useBlaettchen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // useState keys are shared across calls, so reset the store between tests.
    const state = useBlaettchen()
    state.issues.value = []
    state.contact.value = null
    state.loadError.value = false
    useState('blaettchen-loaded', () => false).value = false
    useState<Promise<void> | null>('blaettchen-inflight', () => null).value = null
  })

  it('shares one request between the two rail instances', async () => {
    // Desktop and mobile rail both mount before the first response arrives.
    mock$fetch.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(LISTING)
          }, 10),
        ),
    )
    const { load } = useBlaettchen()
    await Promise.all([load(), load()])
    expect(mock$fetch).toHaveBeenCalledTimes(1)
  })

  it('loads the issues once and reports that there are some', async () => {
    mock$fetch.mockResolvedValue(LISTING)
    const { issues, contact, hasIssues, load } = useBlaettchen()

    await load()
    expect(issues.value).toStrictEqual(LISTING.issues)
    expect(contact.value).toBe('redaktion@example.com')
    expect(hasIssues.value).toBe(true)

    // A second consumer (the page after the rail) must not refetch.
    await load()
    expect(mock$fetch).toHaveBeenCalledTimes(1)
  })

  it('refetches when forced, because issues appear without a restart', async () => {
    mock$fetch.mockResolvedValue(LISTING)
    const { load } = useBlaettchen()
    await load()
    await load(true)
    expect(mock$fetch).toHaveBeenCalledTimes(2)
  })

  it('reports no issues for an empty archive', async () => {
    mock$fetch.mockResolvedValue({ issues: [], contact: 'redaktion@example.com' })
    const { hasIssues, loadError, load } = useBlaettchen()
    await load()
    expect(hasIssues.value).toBe(false)
    // Empty is a legitimate state, not an error — the page says "nothing yet".
    expect(loadError.value).toBe(false)
  })

  it('reports no issues and flags the error when loading fails', async () => {
    // A broken directory must not leave a stale list behind, otherwise the rail
    // would keep offering an entry whose links no longer work.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockResolvedValueOnce(LISTING)
    const { issues, contact, hasIssues, loadError, load } = useBlaettchen()
    await load()
    expect(hasIssues.value).toBe(true)

    mock$fetch.mockRejectedValueOnce(new Error('500'))
    await load(true)
    expect(issues.value).toStrictEqual([])
    expect(contact.value).toBeNull()
    expect(hasIssues.value).toBe(false)
    expect(loadError.value).toBe(true)
    consoleSpy.mockRestore()
  })

  it('tracks the loading flag across a failed load', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockRejectedValue(new Error('boom'))
    const { isLoading, load } = useBlaettchen()
    await load()
    expect(isLoading.value).toBe(false)
    consoleSpy.mockRestore()
  })

  it('formats a publication date without slipping a day', () => {
    // `2025-12-24` parses as UTC midnight; formatting that instant west of
    // Greenwich would show the 23rd. The test locale is en, the app's is de —
    // what matters here is the day, not the wording.
    const { formatDate } = useBlaettchen()
    expect(formatDate('2025-12-24')).toContain('24')
    expect(formatDate('2025-12-24')).toContain('2025')
  })

  it('abbreviates the month for the list rows, without losing the day', () => {
    // A row has to fit issue, date and button on one phone line, and the month
    // name decided whether it did — see formatDateShort. Asserted against the
    // long form rather than against a literal, so it holds in any locale.
    const { formatDate, formatDateShort } = useBlaettchen()
    expect(formatDateShort('2025-12-24')).toContain('24')
    expect(formatDateShort('2025-12-24')).toContain('2025')
    expect(formatDateShort('2025-12-24').length).toBeLessThan(formatDate('2025-12-24').length)
  })

  it('escapes the file name into a single URL segment', () => {
    // Issue names carry spaces and umlauts; unescaped they would break the
    // route match — or, with a slash, address a different path entirely.
    const { urlFor } = useBlaettchen()
    expect(
      urlFor({ number: 4, date: '2023-12-23', title: 'Ä B', file: '04_2023-12-23_Ä B.pdf' }),
    ).toBe('/api/blaettchen/04_2023-12-23_%C3%84%20B.pdf')
  })

  describe('refresh on resume', () => {
    const LATER = {
      issues: [{ number: 13, date: '2026-06-01', file: '13_2026-06-01.pdf' }, ...LISTING.issues],
      contact: 'blaettchen@example.com',
    }

    it('asks again without passing through the loading state', async () => {
      mock$fetch.mockResolvedValue(LISTING)
      const { issues, contact, isLoading, load, refresh } = useBlaettchen()
      await load()
      mock$fetch.mockResolvedValue(LATER)

      const refreshing = refresh()
      expect(isLoading.value).toBe(false)
      await refreshing

      expect(issues.value).toStrictEqual(LATER.issues)
      expect(contact.value).toBe(LATER.contact)
    })

    it('clears an error message once the archive is readable again', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mock$fetch.mockRejectedValueOnce(new Error('500'))
      const { issues, loadError, load, refresh } = useBlaettchen()
      await load()
      expect(loadError.value).toBe(true)

      mock$fetch.mockResolvedValue(LISTING)
      await refresh()
      expect(loadError.value).toBe(false)
      expect(issues.value).toStrictEqual(LISTING.issues)
      consoleSpy.mockRestore()
    })

    it('keeps the list on screen when the network is not back yet', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mock$fetch.mockResolvedValueOnce(LISTING)
      const { issues, contact, loadError, load, refresh } = useBlaettchen()
      await load()

      mock$fetch.mockRejectedValueOnce(new Error('offline'))
      await refresh()
      expect(issues.value).toStrictEqual(LISTING.issues)
      expect(contact.value).toBe(LISTING.contact)
      expect(loadError.value).toBe(false)
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('joins a request that is already on its way', async () => {
      mock$fetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => {
              resolve(LISTING)
            }, 10),
          ),
      )
      const { refresh } = useBlaettchen()
      await Promise.all([refresh(), refresh()])
      expect(mock$fetch).toHaveBeenCalledTimes(1)
    })
  })
})
