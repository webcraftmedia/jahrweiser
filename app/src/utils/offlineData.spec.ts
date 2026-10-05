import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'

import { deleteOfflineDatabase, loadEntry, loadOverlapping, saveEntry } from './offlineData'

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
})
