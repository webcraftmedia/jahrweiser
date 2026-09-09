import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useTelegramChannels } from './useTelegramChannels'

const mock$fetch = vi.fn()
vi.stubGlobal('$fetch', mock$fetch)

const CHANNELS = [{ id: 1, name: 'Info', url: 'https://t.me/info', public: true }]

describe('useTelegramChannels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // useState keys are shared across calls, so reset the store between tests.
    const state = useTelegramChannels()
    state.channels.value = []
    state.loadError.value = false
    useState('telegram-channels-loaded', () => false).value = false
    useState<Promise<void> | null>('telegram-channels-inflight', () => null).value = null
  })

  it('shares one request between the two rail instances', async () => {
    // Desktop and mobile rail both mount before the first response arrives.
    mock$fetch.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(CHANNELS)
          }, 10),
        ),
    )
    const { load } = useTelegramChannels()
    await Promise.all([load(), load()])
    expect(mock$fetch).toHaveBeenCalledTimes(1)
  })

  it('loads the channels once and reports that there are some', async () => {
    mock$fetch.mockResolvedValue(CHANNELS)
    const { channels, hasChannels, load } = useTelegramChannels()

    await load()
    expect(channels.value).toStrictEqual(CHANNELS)
    expect(hasChannels.value).toBe(true)

    // A second consumer (the page after the rail) must not refetch.
    await load()
    expect(mock$fetch).toHaveBeenCalledTimes(1)
  })

  it('refetches when forced, because the file changes without a restart', async () => {
    mock$fetch.mockResolvedValue(CHANNELS)
    const { load } = useTelegramChannels()
    await load()
    await load(true)
    expect(mock$fetch).toHaveBeenCalledTimes(2)
  })

  it('reports no channels for an empty list', async () => {
    mock$fetch.mockResolvedValue([])
    const { hasChannels, loadError, load } = useTelegramChannels()
    await load()
    expect(hasChannels.value).toBe(false)
    // Empty is a legitimate state, not an error — the page says "not configured".
    expect(loadError.value).toBe(false)
  })

  it('reports no channels and flags the error when loading fails', async () => {
    // A broken file must not leave a stale list behind, otherwise the rail
    // would keep offering an entry that no longer works.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockResolvedValueOnce(CHANNELS)
    const { channels, hasChannels, loadError, load } = useTelegramChannels()
    await load()
    expect(hasChannels.value).toBe(true)

    mock$fetch.mockRejectedValueOnce(new Error('500'))
    await load(true)
    expect(channels.value).toStrictEqual([])
    expect(hasChannels.value).toBe(false)
    expect(loadError.value).toBe(true)
    consoleSpy.mockRestore()
  })

  it('tracks the loading flag across a failed load', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockRejectedValue(new Error('boom'))
    const { isLoading, load } = useTelegramChannels()
    await load()
    expect(isLoading.value).toBe(false)
    consoleSpy.mockRestore()
  })
})
