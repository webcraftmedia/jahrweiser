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

  it('escapes the file name into a single URL segment', () => {
    // Issue names carry spaces and umlauts; unescaped they would break the
    // route match — or, with a slash, address a different path entirely.
    const { urlFor } = useBlaettchen()
    expect(
      urlFor({ number: 4, date: '2023-12-23', title: 'Ä B', file: '04_2023-12-23_Ä B.pdf' }),
    ).toBe('/api/blaettchen/04_2023-12-23_%C3%84%20B.pdf')
  })
})
