import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { stubApi } from '../../../../test/helpers/stub-api'

import Page from './index.vue'

const mock$fetch = vi.fn()
stubApi(mock$fetch)

function member(over: Record<string, unknown> = {}) {
  return {
    uid: 'u1',
    // Already abbreviated and masked when it arrives — the server does that.
    name: 'Anna M.',
    email: 'an•••@ex•••.de',
    role: 'user',
    status: 'active',
    newsletter: 'subscribed',
    createdAt: '2026-01-02T10:00:00.000Z',
    lastSeenAt: '2026-09-01T08:00:00.000Z',
    activeSessions: 2,
    ...over,
  }
}

/** Serve one page of the list, and capture what was asked for. */
function serving(payload: { members: unknown[]; total?: number }) {
  const calls: { query?: Record<string, unknown> }[] = []
  mock$fetch.mockImplementation((url: string, opts?: { query?: Record<string, unknown> }) => {
    if (url === '/api/admin/members/list') {
      calls.push({ query: opts?.query })
      return Promise.resolve({
        members: payload.members,
        total: payload.total ?? payload.members.length,
        page: opts?.query?.page ?? 1,
        perPage: 25,
      })
    }
    return Promise.resolve({})
  })
  return calls
}

async function mountLoaded() {
  const wrapper = await mountSuspended(Page, { route: '/admin/members' })
  await vi.waitFor(() => {
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })
  return wrapper
}

describe('Page: Admin Members', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serving({ members: [member()] })
  })

  it('lists what the server sends, without touching it', async () => {
    const wrapper = await mountLoaded()
    expect(wrapper.text()).toContain('Anna M.')
    expect(wrapper.text()).toContain('an•••@ex•••.de')
  })

  it('shows the loading state before the first answer', async () => {
    mock$fetch.mockImplementation(() => new Promise(() => {}))
    const wrapper = await mountSuspended(Page, { route: '/admin/members' })
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
  })

  it('says so when the list cannot be loaded', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockRejectedValue(new Error('boom'))
    const wrapper = await mountSuspended(Page, { route: '/admin/members' })
    await vi.waitFor(() => {
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    })
    expect(wrapper.text()).toContain('pages.admin.members.list.error')
    consoleSpy.mockRestore()
  })

  it('says so when nobody matches', async () => {
    serving({ members: [] })
    const wrapper = await mountLoaded()
    expect(wrapper.text()).toContain('pages.admin.members.list.empty')
  })

  it('sends the search term on', async () => {
    const calls = serving({ members: [member()] })
    const wrapper = await mountLoaded()
    await wrapper.find('#member-search').setValue('muster')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => {
      expect(calls.length).toBe(2)
    })
    expect(calls[1]!.query).toMatchObject({ q: 'muster' })
  })

  it('starts a new search on the first page', async () => {
    // Page 3 of the old result says nothing about the new one.
    const calls = serving({ members: [member()], total: 80 })
    const wrapper = await mountLoaded()
    await wrapper.findAll('button').at(-1)!.trigger('click') // next page
    await vi.waitFor(() => {
      expect(calls.length).toBe(2)
    })
    await wrapper.find('#member-search').setValue('anna')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => {
      expect(calls.length).toBe(3)
    })
    expect(calls[2]!.query).toMatchObject({ page: 1 })
  })

  it('leaves the term out entirely when the box is empty', async () => {
    const calls = serving({ members: [member()] })
    await mountLoaded()
    expect(calls[0]!.query).toMatchObject({ q: undefined, status: 'all' })
  })

  it('passes the status filter on', async () => {
    const calls = serving({ members: [member()] })
    const wrapper = await mountLoaded()
    await wrapper.find('#member-status').setValue('blocked')
    await vi.waitFor(() => {
      expect(calls.length).toBe(2)
    })
    expect(calls[1]!.query).toMatchObject({ status: 'blocked' })
  })

  it('walks pages as far as the total allows, and no further', async () => {
    const calls = serving({ members: [member()], total: 30 })
    const wrapper = await mountLoaded()
    const next = () => wrapper.findAll('button').at(-1)!
    const previous = () => wrapper.findAll('button').at(-2)!

    expect(previous().attributes('disabled')).toBeDefined()
    await next().trigger('click')
    await vi.waitFor(() => {
      expect(calls.length).toBe(2)
    })
    expect(calls[1]!.query).toMatchObject({ page: 2 })
    // 30 members, 25 per page: page 2 is the last one.
    await vi.waitFor(() => {
      expect(next().attributes('disabled')).toBeDefined()
    })
  })

  it('walks back again', async () => {
    const calls = serving({ members: [member()], total: 60 })
    const wrapper = await mountLoaded()
    const next = () => wrapper.findAll('button').at(-1)!
    const previous = () => wrapper.findAll('button').at(-2)!

    await next().trigger('click')
    await vi.waitFor(() => {
      expect(calls.length).toBe(2)
    })
    await previous().trigger('click')
    await vi.waitFor(() => {
      expect(calls.length).toBe(3)
    })
    expect(calls[2]!.query).toMatchObject({ page: 1 })
  })

  it.each([
    ['active', 'pages.admin.members.status.active'],
    ['blocked', 'pages.admin.members.status.blocked'],
    ['deleted', 'pages.admin.members.status.deleted'],
  ])('badges a %s member', async (status, label) => {
    serving({ members: [member({ status })] })
    const wrapper = await mountLoaded()
    expect(wrapper.text()).toContain(label)
  })

  it('marks an admin as one', async () => {
    serving({ members: [member({ role: 'admin' })] })
    const wrapper = await mountLoaded()
    expect(wrapper.text()).toContain('pages.admin.members.table.admin')
  })

  it('names a member who never logged in rather than showing an empty cell', async () => {
    serving({ members: [member({ lastSeenAt: null, name: '' })] })
    const wrapper = await mountLoaded()
    expect(wrapper.text()).toContain('pages.admin.members.table.unnamed')
    expect(wrapper.text()).toContain('pages.admin.members.table.never')
  })

  it('links each row to its detail page', async () => {
    const wrapper = await mountLoaded()
    expect(wrapper.html()).toContain('/admin/members/u1')
  })
})
