// @vitest-environment node
import '../../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'

import {
  dbCalls,
  firstDbCall,
  mockDb,
  queueDbResults,
  resetDb,
} from '../../../../test/helpers/mock-db'

import createHandler from './create.post'
import deleteHandler from './delete.post'
import moveHandler from './move.post'
import updateHandler from './update.post'

vi.mock('~~/server/db', () => ({ useDb: () => mockDb }))

const createFn = createHandler as unknown as (event: unknown) => Promise<unknown>
const updateFn = updateHandler as unknown as (event: unknown) => Promise<unknown>
const deleteFn = deleteHandler as unknown as (event: unknown) => Promise<unknown>
const moveFn = moveHandler as unknown as (event: unknown) => Promise<unknown>

function asAdmin(): void {
  vi.mocked(globalThis.requireUserSession).mockResolvedValue({
    user: { uid: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'admin' },
  })
}
function asUser(): void {
  vi.mocked(globalThis.requireUserSession).mockResolvedValue({
    user: { uid: 'u1', name: 'User', email: 'user@example.com', role: 'user' },
  })
}

function body(value: Record<string, unknown>): void {
  vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validate) =>
    (validate as (data: unknown) => unknown)(value),
  )
}

const VALID = {
  name: 'Kultur-Steher',
  description: 'Orga und Termine',
  url: 'https://t.me/+AbCdEf',
  public: false,
}

/** What the handler passed to `.values(...)` / `.set(...)`. */
function written(method: 'values' | 'set'): Record<string, unknown> {
  return firstDbCall(method)?.[0] as Record<string, unknown>
}

describe('admin/telegram-channels', () => {
  beforeEach(() => {
    resetDb()
    vi.clearAllMocks()
    asAdmin()
  })

  describe('create.post', () => {
    beforeEach(() => {
      body(VALID)
    })

    it.each([
      ['create', () => createFn({})],
      ['update', () => updateFn({})],
      ['delete', () => deleteFn({})],
      ['move', () => moveFn({})],
    ])('refuses a member on %s', async (_name, run) => {
      asUser()
      await expect(run()).rejects.toThrow('Not Authorized')
      expect(dbCalls()).toStrictEqual([])
    })

    it('refuses an anonymous request', async () => {
      vi.mocked(globalThis.requireUserSession).mockRejectedValue(new Error('Unauthorized'))
      await expect(createFn({})).rejects.toThrow('Unauthorized')
    })

    it('appends the channel behind the last one', async () => {
      // Position 4 is taken, so the new one goes to 5 — an admin moves it from
      // there. Inserting at 0 would silently demote whatever was on top.
      queueDbResults([{ value: 4 }])
      await createFn({})
      expect(written('values')).toMatchObject({ sortOrder: 5 })
    })

    it('starts at 0 for the very first channel', async () => {
      queueDbResults([{ value: null }])
      await createFn({})
      expect(written('values')).toMatchObject({ sortOrder: 0 })
    })

    it('records who added it — an invite link is a permission', async () => {
      queueDbResults([{ value: null }])
      await createFn({})
      expect(written('values')).toMatchObject({ createdByUid: 'admin-1' })
    })

    it('stores an omitted description as null rather than an empty string', async () => {
      body({ ...VALID, description: undefined })
      queueDbResults([{ value: null }])
      await createFn({})
      expect(written('values')).toMatchObject({ description: null })
    })

    it('defaults the public flag to false when it is not sent', async () => {
      body({ name: VALID.name, url: VALID.url })
      queueDbResults([{ value: null }])
      await createFn({})
      expect(written('values')).toMatchObject({ isPublic: false })
    })

    it('trims what the form sends', async () => {
      body({ ...VALID, name: '  Kultur-Steher  ' })
      queueDbResults([{ value: null }])
      await createFn({})
      expect(written('values')).toMatchObject({ name: 'Kultur-Steher' })
    })

    it.each([
      [{ ...VALID, url: 'https://example.com/phish' }, 'a link that does not go to Telegram'],
      [{ ...VALID, url: 'https://t.me/' }, 'the bare prefix without a channel'],
      [{ ...VALID, url: 'not a url' }, 'something that is not a URL'],
      [{ ...VALID, name: '   ' }, 'a name that is only whitespace'],
      [{ url: VALID.url }, 'no name at all'],
      [{ name: VALID.name }, 'no link at all'],
    ])('rejects %o (%s)', async (input) => {
      // Guards against a typo turning the channel list into an open-redirect
      // surface — the same rule the form checks before it enables the button.
      body(input)
      await expect(createFn({})).rejects.toThrow(z.ZodError)
      expect(dbCalls().some((call) => call.method === 'insert')).toBe(false)
    })
  })

  describe('update.post', () => {
    beforeEach(() => {
      body({ id: 3, ...VALID, public: true })
    })

    it('writes the edited fields', async () => {
      queueDbResults([{ id: 3 }])
      await updateFn({})
      expect(written('set')).toStrictEqual({
        name: 'Kultur-Steher',
        description: 'Orga und Termine',
        url: 'https://t.me/+AbCdEf',
        isPublic: true,
      })
    })

    it('leaves the position alone', async () => {
      // Editing the text of a channel must not reshuffle the list under the
      // feet of whoever is sorting it in another tab.
      queueDbResults([{ id: 3 }])
      await updateFn({})
      expect(written('set')).not.toHaveProperty('sortOrder')
    })

    it('clears a description that was emptied in the form', async () => {
      // The page sends no description at all once the field is empty; the
      // column has to become NULL rather than keep the old text.
      body({ id: 3, name: VALID.name, url: VALID.url })
      queueDbResults([{ id: 3 }])
      await updateFn({})
      expect(written('set')).toMatchObject({ description: null, isPublic: false })
    })

    it('answers 404 for a channel that is no longer there', async () => {
      queueDbResults([])
      await expect(updateFn({})).rejects.toThrow('Channel not found')
      expect(dbCalls().some((call) => call.method === 'update')).toBe(false)
    })

    it('applies the same rules as create', async () => {
      body({ id: 3, ...VALID, url: 'https://example.com/phish' })
      await expect(updateFn({})).rejects.toThrow(z.ZodError)
    })
  })

  describe('delete.post', () => {
    beforeEach(() => {
      body({ id: 3 })
    })

    it('removes the channel and records who did', async () => {
      // The link cannot be looked up again in Telegram, so the log is the only
      // trace that it ever existed.
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      queueDbResults([{ name: 'Kultur-Steher' }])
      await expect(deleteFn({})).resolves.toStrictEqual({})
      expect(dbCalls().some((call) => call.method === 'delete')).toBe(true)
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('admin@example.com'))
      consoleSpy.mockRestore()
    })

    it('answers 404 for a channel that is already gone', async () => {
      queueDbResults([])
      await expect(deleteFn({})).rejects.toThrow('Channel not found')
      expect(dbCalls().some((call) => call.method === 'delete')).toBe(false)
    })
  })

  describe('move.post', () => {
    /** The positions written, in the order the rows were updated. */
    function positions(): number[] {
      return dbCalls()
        .filter((call) => call.method === 'set')
        .map((call) => (call.args[0] as { sortOrder: number }).sortOrder)
    }

    it('swaps a channel with the one above it', async () => {
      body({ id: 2, direction: 'up' })
      queueDbResults([{ id: 1 }, { id: 2 }, { id: 3 }])
      await moveFn({})
      // Rewritten as a dense sequence over the new order [2, 1, 3].
      expect(positions()).toStrictEqual([0, 1, 2])
      expect(dbCalls().filter((call) => call.method === 'set')).toHaveLength(3)
    })

    it('swaps a channel with the one below it', async () => {
      body({ id: 2, direction: 'down' })
      queueDbResults([{ id: 1 }, { id: 2 }, { id: 3 }])
      await moveFn({})
      expect(positions()).toStrictEqual([0, 1, 2])
    })

    it('rewrites every position, healing gaps a deletion left behind', async () => {
      // Positions in the table may be 0, 3, 7 after edits and imports; after a
      // move they are 0, 1, 2 again.
      body({ id: 3, direction: 'up' })
      queueDbResults([{ id: 1 }, { id: 3 }, { id: 9 }])
      await moveFn({})
      expect(positions()).toStrictEqual([0, 1, 2])
    })

    it('does nothing at the top of the list', async () => {
      // The button is disabled there, but a stale page must not get an error.
      body({ id: 1, direction: 'up' })
      queueDbResults([{ id: 1 }, { id: 2 }])
      await expect(moveFn({})).resolves.toStrictEqual({})
      expect(dbCalls().some((call) => call.method === 'update')).toBe(false)
    })

    it('does nothing at the bottom of the list', async () => {
      body({ id: 2, direction: 'down' })
      queueDbResults([{ id: 1 }, { id: 2 }])
      await expect(moveFn({})).resolves.toStrictEqual({})
      expect(dbCalls().some((call) => call.method === 'update')).toBe(false)
    })

    it('answers 404 for a channel that is not in the list', async () => {
      body({ id: 99, direction: 'up' })
      queueDbResults([{ id: 1 }, { id: 2 }])
      await expect(moveFn({})).rejects.toThrow('Channel not found')
    })

    it('rejects a direction it does not know', async () => {
      body({ id: 1, direction: 'sideways' })
      await expect(moveFn({})).rejects.toThrow(z.ZodError)
    })
  })
})
