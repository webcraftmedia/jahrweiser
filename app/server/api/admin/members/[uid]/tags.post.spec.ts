// @vitest-environment node
import '../../../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { mockDb, queueDbResults, resetDb } from '../../../../../test/helpers/mock-db'

import handler from './tags.post'

vi.mock('~~/server/db', () => ({ useDb: () => mockDb }))

const mockRecordEvent = vi.fn()
vi.mock('~~/server/helpers/events', () => ({
  recordEvent: (...a: unknown[]) => mockRecordEvent(...a),
}))

const mockApplyTagChanges = vi.fn()
vi.mock('~~/server/helpers/userTags', () => ({
  applyTagChanges: (...a: unknown[]) => mockApplyTagChanges(...a),
}))

const fn = handler as unknown as (e: unknown) => Promise<{ granted: string[] }>

function sending(tags: { name: string; state: boolean }[]) {
  vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_e, v) =>
    (v as (d: unknown) => unknown)({ tags }),
  )
}

describe('admin/members/[uid]/tags.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'a1', email: 'admin@example.de', name: 'Admin', role: 'admin' },
    })
    vi.mocked(globalThis.getRouterParam).mockReturnValue('u1')
    sending([{ name: 'vorstand', state: true }])
    mockApplyTagChanges.mockResolvedValue({ newTags: ['vorstand'], created: false })
  })

  it('refuses anybody who is not an admin', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', role: 'user' },
    })
    await expect(fn({})).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses a request without a uid', async () => {
    vi.mocked(globalThis.getRouterParam).mockReturnValue(undefined)
    await expect(fn({})).rejects.toMatchObject({ statusCode: 400 })
  })

  it('answers 404 for a uid nobody has', async () => {
    queueDbResults([])
    await expect(fn({})).rejects.toMatchObject({ statusCode: 404 })
  })

  it('applies the change against the resolved address', async () => {
    queueDbResults([{ email: 'anna@example.de' }])
    await expect(fn({})).resolves.toStrictEqual({ granted: ['vorstand'] })
    expect(mockApplyTagChanges).toHaveBeenCalledWith(
      expect.anything(),
      'admin@example.de',
      'anna@example.de',
      [{ name: 'vorstand', state: true }],
    )
  })

  it('records who granted what, and to whom', async () => {
    queueDbResults([{ email: 'anna@example.de' }])
    await fn({ path: '/api/admin/members/u1/tags' })
    expect(mockRecordEvent).toHaveBeenCalledWith({
      type: 'admin.tags_changed',
      userUid: 'u1',
      actorUid: 'a1',
      meta: { granted: ['vorstand'], calendars: ['vorstand'] },
      event: { path: '/api/admin/members/u1/tags' },
    })
  })

  it('sends no welcome mail from here', async () => {
    // That mail introduces somebody to the Jahrweiser; this page adjusts an
    // account that has existed for a while, and repeating it on every checkbox
    // would train members to ignore it.
    queueDbResults([{ email: 'anna@example.de' }])
    const result = await fn({})
    expect(result).not.toHaveProperty('mailed')
  })

  it('refuses a body that is not a tag list', async () => {
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_e, v) =>
      (v as (d: unknown) => unknown)({ tags: 'all' }),
    )
    await expect(fn({})).rejects.toThrow(/invalid|expected|received/i)
  })
})
