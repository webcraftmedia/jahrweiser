// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { mockDb, queueDbResults, resetDb } from '../../test/helpers/mock-db'

import handler from './telegram-channels.get'

import type { TelegramChannel } from '~~/shared/telegram'

vi.mock('~~/server/db', () => ({ useDb: () => mockDb }))

const handlerFn = handler as unknown as (event: unknown) => Promise<TelegramChannel[]>

/** A row as it comes back from the table. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Kultur-Steher',
    description: 'Orga und Termine',
    url: 'https://t.me/+AbCdEf',
    isPublic: false,
    sortOrder: 0,
    createdByUid: 'admin-1',
    createdAt: new Date('2026-01-01T10:00:00Z'),
    updatedAt: new Date('2026-01-01T10:00:00Z'),
    ...overrides,
  }
}

describe('telegram-channels.get', () => {
  beforeEach(() => {
    resetDb()
    vi.clearAllMocks()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', name: 'User', email: 'user@example.com', role: 'user' },
    })
  })

  it('requires a session — an invite link is the permission itself', async () => {
    vi.mocked(globalThis.requireUserSession).mockRejectedValue(new Error('Unauthorized'))
    await expect(handlerFn({})).rejects.toThrow('Unauthorized')
  })

  it('hands out only what the page needs, not the whole row', async () => {
    // Who added a channel and when is admin bookkeeping; it has no business in
    // a response every member receives.
    queueDbResults([row()])
    await expect(handlerFn({})).resolves.toStrictEqual([
      {
        id: 1,
        name: 'Kultur-Steher',
        description: 'Orga und Termine',
        url: 'https://t.me/+AbCdEf',
        public: false,
      },
    ])
  })

  it('omits an empty description rather than sending null', async () => {
    // The page renders it with `v-if="channel.description"`, and null would
    // travel through the composable's type as a string.
    queueDbResults([row({ description: null })])
    const [channel] = await handlerFn({})
    expect(channel).not.toHaveProperty('description')
  })

  it('carries the public flag through as the label it is', async () => {
    queueDbResults([row({ isPublic: true })])
    const [channel] = await handlerFn({})
    expect(channel!.public).toBe(true)
  })

  it('returns an empty list while nothing is configured', async () => {
    // A legitimate state: the icon rail then hides its entry.
    queueDbResults([])
    await expect(handlerFn({})).resolves.toStrictEqual([])
  })

  it('leaves the order to the database', async () => {
    // Ordering is `ORDER BY sort_order, id` — SQL, so it is asserted against
    // real MariaDB in e2e-full-stack. Here we only prove the handler does not
    // reshuffle what it got.
    queueDbResults([row({ id: 7, name: 'Zweiter' }), row({ id: 2, name: 'Erster' })])
    const channels = await handlerFn({})
    expect(channels.map((channel) => channel.name)).toStrictEqual(['Zweiter', 'Erster'])
  })
})
