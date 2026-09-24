import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { stubApi } from '../../../../test/helpers/stub-api'

import Page from './[uid].vue'

const mock$fetch = vi.fn()
stubApi(mock$fetch)

const ROUTE = '/admin/members/u1'

// Mounted on its own, the page does not receive the `uid` segment from the
// router — the requests would go to `/api/admin/members/undefined`. Stating the
// parameter here keeps these tests about what the page does with it; that the
// route carries it in the first place is Nuxt's job, not this page's.
mockNuxtImport('useRoute', () => () => ({ params: { uid: 'u1' }, query: {} }))

function session(over: Record<string, unknown> = {}) {
  return {
    id: 'abcdef01',
    createdAt: '2026-09-01T08:00:00.000Z',
    expiresAt: '2026-12-01T08:00:00.000Z',
    lastSeenAt: '2026-09-20T08:00:00.000Z',
    revokedAt: null,
    active: true,
    ...over,
  }
}

function detail(over: Record<string, unknown> = {}) {
  return {
    uid: 'u1',
    name: 'Anna M.',
    email: 'an•••@ex•••.de',
    role: 'user',
    status: 'active',
    newsletter: 'subscribed',
    postalCode: '64625',
    createdAt: '2026-01-02T10:00:00.000Z',
    deletedAt: null,
    sessions: [session()],
    ...over,
  }
}

interface Call {
  url: string
  method?: string
  body?: Record<string, unknown>
  query?: Record<string, unknown>
}

/**
 * Serve the detail page's two reads, record every call, and let a test decide
 * what the action endpoints answer.
 */
function serving(
  member: Record<string, unknown> = detail(),
  events: unknown[] = [],
  actions: Record<string, unknown> = {},
) {
  const calls: Call[] = []
  mock$fetch.mockImplementation(
    (url: string, opts?: { method?: string; body?: Record<string, unknown>; query?: Record<string, unknown> }) => {
      calls.push({ url, method: opts?.method, body: opts?.body, query: opts?.query })
      if (url === '/api/admin/members/u1') return Promise.resolve(member)
      if (url === '/api/admin/members/u1/events') return Promise.resolve({ events })
      const action = actions[url]
      if (action instanceof Error) return Promise.reject(action)
      return Promise.resolve(action ?? {})
    },
  )
  return calls
}

async function mountLoaded() {
  const wrapper = await mountSuspended(Page, { route: ROUTE })
  await vi.waitFor(() => {
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })
  return wrapper
}

/** The action button carrying a given label key. */
function button(wrapper: Awaited<ReturnType<typeof mountLoaded>>, key: string) {
  const found = wrapper.findAll('button').find((b) => b.text().includes(key))
  expect(found, `no button for ${key}`).toBeDefined()
  return found!
}

describe('Page: Admin Member detail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serving()
  })

  it('shows the member as the server masked them', async () => {
    const wrapper = await mountLoaded()
    expect(wrapper.text()).toContain('Anna M.')
    expect(wrapper.text()).toContain('an•••@ex•••.de')
  })

  it('says so when the member cannot be loaded', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockRejectedValue(new Error('boom'))
    const wrapper = await mountSuspended(Page, { route: ROUTE })
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.admin.members.detail.error')
    })
    consoleSpy.mockRestore()
  })

  // Revealing is a deliberate act with a record attached — never something the
  // page does on its own just because it was opened.
  it('does not reveal the address by being opened', async () => {
    const calls = serving()
    await mountLoaded()
    expect(calls.some((c) => c.url.endsWith('/reveal'))).toBe(false)
  })

  it('reveals the address on request and says that it was noted', async () => {
    const calls = serving(detail(), [], {
      '/api/admin/members/u1/reveal': { email: 'anna.mustermann@example.de' },
    })
    const wrapper = await mountLoaded()

    await button(wrapper, 'pages.admin.members.detail.reveal').trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('anna.mustermann@example.de')
    })
    expect(wrapper.text()).toContain('pages.admin.members.detail.revealed-note')
    expect(calls.find((c) => c.url.endsWith('/reveal'))?.method).toBe('POST')
  })

  it('says so when revealing fails, and keeps the address hidden', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    serving(detail(), [], { '/api/admin/members/u1/reveal': new Error('boom') })
    const wrapper = await mountLoaded()

    await button(wrapper, 'pages.admin.members.detail.reveal').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.admin.members.detail.action-error')
    })
    expect(wrapper.text()).toContain('an•••@ex•••.de')
    consoleSpy.mockRestore()
  })

  it('sends a login link on request', async () => {
    const calls = serving(detail(), [], { '/api/admin/members/u1/login-link': {} })
    const wrapper = await mountLoaded()

    await button(wrapper, 'pages.admin.members.detail.send-login-link').trigger('click')

    await vi.waitFor(() => {
      expect(calls.some((c) => c.url.endsWith('/login-link'))).toBe(true)
    })
    expect(calls.find((c) => c.url.endsWith('/login-link'))?.method).toBe('POST')
    expect(wrapper.text()).toContain('pages.admin.members.detail.login-link-note')
  })

  it('unblocks a blocked member', async () => {
    const calls = serving(detail({ status: 'blocked' }), [], {
      '/api/admin/members/u1/block': { blocked: false, revokedSessions: 0 },
    })
    const wrapper = await mountLoaded()

    await button(wrapper, 'pages.admin.members.detail.unblock').trigger('click')

    await vi.waitFor(() => {
      expect(calls.some((c) => c.url.endsWith('/block'))).toBe(true)
    })
    expect(calls.find((c) => c.url.endsWith('/block'))?.body).toStrictEqual({ blocked: false })
    expect(wrapper.text()).toContain('pages.admin.members.detail.unblocked-note')
  })

  it('shows a member without a postal code as having none', async () => {
    serving(detail({ postalCode: null, createdAt: null, newsletter: 'unsubscribed' }))
    const wrapper = await mountLoaded()
    expect(wrapper.text()).toContain('pages.admin.members.detail.none')
    expect(wrapper.text()).toContain('pages.admin.members.detail.newsletter-off')
  })

  it('blocks with the reason that was typed', async () => {
    const calls = serving(detail(), [], {
      '/api/admin/members/u1/block': { blocked: true, revokedSessions: 2 },
    })
    const wrapper = await mountLoaded()

    await wrapper.find('#block-reason').setValue('Auf eigenen Wunsch')
    await button(wrapper, 'pages.admin.members.detail.block').trigger('click')

    await vi.waitFor(() => {
      expect(calls.some((c) => c.url.endsWith('/block'))).toBe(true)
    })
    expect(calls.find((c) => c.url.endsWith('/block'))?.body).toStrictEqual({
      blocked: true,
      reason: 'Auf eigenen Wunsch',
    })
  })

  it('offers unblocking, not blocking, for somebody already blocked', async () => {
    serving(detail({ status: 'blocked' }))
    const wrapper = await mountLoaded()
    expect(wrapper.text()).toContain('pages.admin.members.detail.unblock')
    expect(wrapper.find('#block-reason').exists()).toBe(false)
  })

  it('re-reads the member after an action instead of guessing the new state', async () => {
    const calls = serving(detail(), [], {
      '/api/admin/members/u1/sessions': { revokedSessions: 2 },
    })
    const wrapper = await mountLoaded()
    const before = calls.filter((c) => c.url === '/api/admin/members/u1').length

    await button(wrapper, 'pages.admin.members.detail.revoke-sessions').trigger('click')

    await vi.waitFor(() => {
      expect(calls.filter((c) => c.url === '/api/admin/members/u1').length).toBe(before + 1)
    })
  })

  it('says so when an action fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = await mountLoaded()
    serving(detail(), [], { '/api/admin/members/u1/sessions': new Error('boom') })

    await button(wrapper, 'pages.admin.members.detail.revoke-sessions').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.admin.members.detail.action-error')
    })
    consoleSpy.mockRestore()
  })

  it('does not offer to end sessions that are not there', async () => {
    serving(detail({ sessions: [session({ active: false, revokedAt: '2026-09-02T00:00:00.000Z' })] }))
    const wrapper = await mountLoaded()
    expect(
      button(wrapper, 'pages.admin.members.detail.revoke-sessions').attributes('disabled'),
    ).toBeDefined()
  })

  it('does not offer a login link to an account that is shut', async () => {
    serving(detail({ status: 'blocked' }))
    const wrapper = await mountLoaded()
    expect(
      button(wrapper, 'pages.admin.members.detail.send-login-link').attributes('disabled'),
    ).toBeDefined()
  })

  it.each([
    [{ active: true, revokedAt: null }, 'pages.admin.members.detail.session-active'],
    [
      { active: false, revokedAt: '2026-09-02T00:00:00.000Z' },
      'pages.admin.members.detail.session-revoked',
    ],
    [{ active: false, revokedAt: null }, 'pages.admin.members.detail.session-expired'],
  ])('tells a session that is %o apart from the others', async (over, label) => {
    serving(detail({ sessions: [session(over)] }))
    const wrapper = await mountLoaded()
    expect(wrapper.text()).toContain(label)
  })

  it('names a member who has no name rather than showing a gap', async () => {
    serving(detail({ name: '' }))
    const wrapper = await mountLoaded()
    expect(wrapper.text()).toContain('pages.admin.members.table.unnamed')
  })

  it('shows a chronicle entry the member caused themselves without an admin note', async () => {
    serving(detail(), [
      {
        id: 2,
        at: '2026-09-20T08:00:00.000Z',
        type: 'auth.redeem_ok',
        meta: null,
        origin: null,
        actorUid: null,
      },
    ])
    const wrapper = await mountLoaded()
    expect(wrapper.text()).toContain('auth.redeem_ok')
    expect(wrapper.text()).not.toContain('pages.admin.members.detail.by-admin')
  })

  it('says when somebody has never logged in', async () => {
    serving(detail({ sessions: [] }))
    const wrapper = await mountLoaded()
    expect(wrapper.text()).toContain('pages.admin.members.detail.sessions-empty')
  })

  it('shows the chronicle, and who was behind an entry', async () => {
    serving(detail(), [
      {
        id: 1,
        at: '2026-09-20T08:00:00.000Z',
        type: 'admin.blocked',
        meta: null,
        origin: '192.0.2.0',
        actorUid: 'a1',
      },
    ])
    const wrapper = await mountLoaded()
    expect(wrapper.text()).toContain('admin.blocked')
    expect(wrapper.text()).toContain('pages.admin.members.detail.by-admin')
    expect(wrapper.text()).toContain('192.0.2.0')
  })

  it('filters the chronicle by group', async () => {
    const calls = serving()
    const wrapper = await mountLoaded()
    await wrapper.find('select').setValue('auth')
    await vi.waitFor(() => {
      expect(calls.some((c) => c.query?.group === 'auth')).toBe(true)
    })
  })

  it('keeps the page standing when only the chronicle fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/admin/members/u1') return Promise.resolve(detail())
      return Promise.reject(new Error('boom'))
    })
    const wrapper = await mountSuspended(Page, { route: ROUTE })
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Anna M.')
    })
    expect(wrapper.text()).toContain('pages.admin.members.detail.chronicle-empty')
    consoleSpy.mockRestore()
  })
})
