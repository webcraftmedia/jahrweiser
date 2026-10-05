import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  CALENDARS_KEY,
  UNDATED_MAX_AGE_MS,
  deleteOfflineDatabase,
  isStale,
  loadEntry,
  loadOverlapping,
  pruneOfflineData,
  saveEntry,
  saveEventList,
} from './offlineData'

const DAY = 24 * 60 * 60 * 1000

async function keys() {
  const found: string[] = []
  for (const key of ['old', 'recent', 'undated', 'stale-undated', CALENDARS_KEY]) {
    if (await loadEntry(key, 'u1')) found.push(key)
  }
  return found
}

describe('offlineData', () => {
  beforeEach(async () => {
    await deleteOfflineDatabase()
  })

  it('stores an entry and gives it back to its member only', async () => {
    await saveEntry({ key: 'calendars', uid: 'u1', savedAt: 1, data: ['A'] })
    await expect(loadEntry('calendars', 'u1')).resolves.toStrictEqual({
      key: 'calendars',
      uid: 'u1',
      savedAt: 1,
      data: ['A'],
    })
    await expect(loadEntry('calendars', 'u2')).resolves.toBeNull()
    await expect(loadEntry('nothing', 'u1')).resolves.toBeNull()
  })

  it('overwrites an entry under the same key', async () => {
    await saveEntry({ key: 'k', uid: 'u1', savedAt: 1, data: 1 })
    await saveEntry({ key: 'k', uid: 'u1', savedAt: 2, data: 2 })
    await expect(loadEntry('k', 'u1')).resolves.toMatchObject({ data: 2 })
  })

  it('finds the event lists of one calendar that overlap a span', async () => {
    const list = (key: string, uid: string, calendar: string, start: number, end: number) =>
      saveEntry({ key, uid, savedAt: 1, calendar, start, end, data: [] })
    await list('a', 'u1', 'Work', 0, 10)
    await list('b', 'u1', 'Work', 10, 20)
    await list('c', 'u1', 'Work', 20, 30)
    await list('d', 'u1', 'Home', 0, 30)
    await list('e', 'u2', 'Work', 0, 30)
    await saveEntry({ key: 'calendars', uid: 'u1', savedAt: 1, data: [] })

    const found = await loadOverlapping('u1', 'Work', 5, 15)
    expect(found.map((entry) => entry.key).sort()).toStrictEqual(['a', 'b'])
  })

  it('deletes everything at once', async () => {
    await saveEntry({ key: 'k', uid: 'u1', savedAt: 1, data: 1 })
    await deleteOfflineDatabase()
    await expect(loadEntry('k', 'u1')).resolves.toBeNull()
  })

  it('passes a failing request on as an error', async () => {
    // A database newer than the code: opening it fails with a VersionError.
    await new Promise((resolve) => {
      const req = indexedDB.open('jahrweiser-offline', 2)
      req.addEventListener('success', () => {
        req.result.close()
        resolve(undefined)
      })
    })
    await expect(saveEntry({ key: 'k', uid: 'u1', savedAt: 1, data: 1 })).rejects.toThrow(
      'IndexedDB request failed',
    )
  })

  describe('never more of the past than online', () => {
    // 5 October 2026: the calendar reaches back to September, its grid to 25 August.
    const now = new Date(2026, 9, 5, 12).getTime()
    const earliest = new Date(2026, 7, 25).getTime()

    it('tells what is out of reach', () => {
      const entry = (overrides: object) => ({
        key: 'x',
        uid: 'u1',
        savedAt: now,
        data: 0,
        ...overrides,
      })
      expect(isStale(entry({ until: earliest }), earliest, now)).toBe(true)
      expect(isStale(entry({ until: earliest + 1 }), earliest, now)).toBe(false)
      expect(isStale(entry({ key: CALENDARS_KEY, savedAt: 0 }), earliest, now)).toBe(false)
      expect(isStale(entry({ savedAt: now - UNDATED_MAX_AGE_MS }), earliest, now)).toBe(false)
      expect(isStale(entry({ savedAt: now - UNDATED_MAX_AGE_MS - 1 }), earliest, now)).toBe(true)
    })

    it('drops what ended before the earliest month, keeps the rest', async () => {
      await saveEntry({
        key: 'old',
        uid: 'u1',
        savedAt: now,
        until: new Date(2026, 7, 1).getTime(),
        data: 0,
      })
      await saveEntry({
        key: 'recent',
        uid: 'u1',
        savedAt: now,
        until: new Date(2026, 8, 3).getTime(),
        data: 0,
      })
      await saveEntry({ key: 'undated', uid: 'u1', savedAt: now - DAY, data: 0 })
      await saveEntry({ key: 'stale-undated', uid: 'u1', savedAt: now - 90 * DAY, data: 0 })
      await saveEntry({ key: CALENDARS_KEY, uid: 'u1', savedAt: now - 365 * DAY, data: [] })

      await expect(pruneOfflineData(now)).resolves.toBe(2)
      await expect(keys()).resolves.toStrictEqual(['recent', 'undated', CALENDARS_KEY])
      // Nothing left to drop the second time round.
      await expect(pruneOfflineData(now)).resolves.toBe(0)
    })

    it('replaces the lists a newer one covers entirely', async () => {
      const list = (key: string, calendar: string, start: number, end: number, uid = 'u1') => ({
        key,
        uid,
        savedAt: 1,
        calendar,
        start,
        end,
        until: end,
        data: [],
      })
      // Fetched ahead (the 1st to the 1st) and partly overlapping (no full cover).
      await saveEntry(list('a', 'Work', 10, 20))
      await saveEntry(list('b', 'Work', 15, 40))
      // Another calendar, another member: untouched.
      await saveEntry(list('c', 'Home', 10, 20))
      await saveEntry(list('d', 'Work', 10, 20, 'u2'))

      // The month grid around it.
      await saveEventList(list('grid', 'Work', 5, 30))

      await expect(loadEntry('a', 'u1')).resolves.toBeNull()
      await expect(loadEntry('b', 'u1')).resolves.not.toBeNull()
      await expect(loadEntry('c', 'u1')).resolves.not.toBeNull()
      await expect(loadEntry('d', 'u2')).resolves.not.toBeNull()
      await expect(loadEntry('grid', 'u1')).resolves.not.toBeNull()
    })

    it('keeps a list when the same span is stored again', async () => {
      const list = { key: 'a', uid: 'u1', savedAt: 1, calendar: 'Work', start: 1, end: 2, data: [] }
      await saveEventList(list)
      await saveEventList({ ...list, savedAt: 2 })
      await expect(loadEntry('a', 'u1')).resolves.toMatchObject({ savedAt: 2 })
    })
  })
})
