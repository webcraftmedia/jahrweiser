import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ deleteOfflineDatabase: vi.fn() }))
vi.mock('./offlineData', () => ({ deleteOfflineDatabase: mocks.deleteOfflineDatabase }))

const KEY = 'jahrweiser-offline-session'
const NOW = 1_700_000_000_000

/** Fresh module per test: `enabled` is module state. */
async function load() {
  vi.resetModules()
  return import('./offlineSession')
}

describe('offlineSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.stubGlobal('caches', { delete: vi.fn().mockResolvedValue(true) })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('records nothing outside the installed app', async () => {
    const { recordSessionExpiry, readOfflineSession } = await load()
    await recordSessionExpiry('u1', '3600', NOW)
    expect(readOfflineSession()).toBeNull()
  })

  it('turns the remaining seconds into a deadline on this device', async () => {
    const m = await load()
    m.enableOfflineSession()
    expect(m.offlineSessionEnabled()).toBe(true)
    await m.recordSessionExpiry('u1', '3600', NOW)
    expect(m.readOfflineSession()).toStrictEqual({ uid: 'u1', deadline: NOW + 3_600_000 })
    expect(m.offlineSessionValid('u1', NOW + 3_599_999)).toBe(true)
    expect(m.offlineSessionValid('u1', NOW + 3_600_000)).toBe(false)
  })

  it.each([
    ['no member', undefined, '3600'],
    ['no header', 'u1', null],
    ['a header that is no number', 'u1', 'soon'],
  ])('ignores a response with %s', async (_label, uid, header) => {
    const m = await load()
    m.enableOfflineSession()
    await m.recordSessionExpiry(uid, header, NOW)
    expect(m.readOfflineSession()).toBeNull()
  })

  it('belongs to one member only', async () => {
    const m = await load()
    m.enableOfflineSession()
    await m.recordSessionExpiry('u1', '3600', NOW)
    expect(m.offlineSessionValid('u2', NOW)).toBe(false)
    expect(m.offlineSessionValid(undefined, NOW)).toBe(false)
  })

  it('clears the previous member’s copy when another one signs in', async () => {
    const m = await load()
    m.enableOfflineSession()
    await m.recordSessionExpiry('u1', '3600', NOW)
    await m.recordSessionExpiry('u2', '60', NOW)
    expect(caches.delete).toHaveBeenCalledWith('jahrweiser-pages')
    expect(mocks.deleteOfflineDatabase).toHaveBeenCalledTimes(1)
    expect(m.readOfflineSession()).toStrictEqual({ uid: 'u2', deadline: NOW + 60_000 })
  })

  it('keeps the copy when the same member’s session slides on', async () => {
    const m = await load()
    m.enableOfflineSession()
    await m.recordSessionExpiry('u1', '3600', NOW)
    await m.recordSessionExpiry('u1', '7200', NOW)
    expect(mocks.deleteOfflineDatabase).not.toHaveBeenCalled()
  })

  it.each([
    ['garbage', '{'],
    ['the wrong shape', JSON.stringify({ uid: 1, deadline: 'x' })],
  ])('reads %s as no session', async (_label, raw) => {
    localStorage.setItem(KEY, raw)
    const { readOfflineSession } = await load()
    expect(readOfflineSession()).toBeNull()
  })

  it('purges the page cache always, and the data only where there is some', async () => {
    const m = await load()
    await m.purgeOfflineData()
    expect(caches.delete).toHaveBeenCalledWith('jahrweiser-pages')
    expect(mocks.deleteOfflineDatabase).not.toHaveBeenCalled()

    localStorage.setItem(KEY, JSON.stringify({ uid: 'u1', deadline: NOW }))
    await m.purgeOfflineData()
    expect(mocks.deleteOfflineDatabase).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('purges without a Cache API, and despite a failing one', async () => {
    const m = await load()
    vi.stubGlobal('caches', undefined)
    await expect(m.purgeOfflineData()).resolves.toBeUndefined()
    vi.stubGlobal('caches', { delete: vi.fn().mockRejectedValue(new Error('denied')) })
    await expect(m.purgeOfflineData()).resolves.toBeUndefined()
  })

  describe('with storage blocked', () => {
    beforeEach(() => {
      const blocked = () => {
        throw new Error('SecurityError')
      }
      vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked })
    })

    it('stays offline-less instead of breaking', async () => {
      const m = await load()
      m.enableOfflineSession()
      await expect(m.recordSessionExpiry('u1', '3600', NOW)).resolves.toBeUndefined()
      expect(m.readOfflineSession()).toBeNull()
      expect(() => {
        m.forgetOfflineSession()
      }).not.toThrow()
    })
  })
})
