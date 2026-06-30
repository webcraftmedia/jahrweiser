import { mountSuspended, renderSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import Page from './links.vue'

const mock$fetch = vi.fn()
vi.stubGlobal('$fetch', mock$fetch)

const mockWriteText = vi.fn()

interface Row {
  token: string
  label: string | null
  maxUses: number | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
  createdByName: string | null
  createdByEmail: string | null
  useCount: number
  status: 'valid' | 'revoked' | 'expired' | 'exhausted'
  url: string
}

const VALID_ROW: Row = {
  token: 'tok-valid',
  label: 'Flyer Herbstfest',
  maxUses: 10,
  expiresAt: '2026-12-31T00:00:00.000Z',
  revokedAt: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  createdByName: 'Admin Adam',
  createdByEmail: 'admin@example.com',
  useCount: 3,
  status: 'valid',
  url: 'http://localhost:3000/register/tok-valid',
}

const REVOKED_ROW: Row = {
  token: 'tok-revoked',
  label: null,
  maxUses: null,
  expiresAt: null,
  revokedAt: '2026-06-10T00:00:00.000Z',
  createdAt: '2026-05-01T00:00:00.000Z',
  createdByName: null,
  createdByEmail: 'creator@example.com',
  useCount: 0,
  status: 'revoked',
  url: 'http://localhost:3000/register/tok-revoked',
}

function listFetch(rows: Row[]) {
  return (url: string) => {
    if (url === '/api/admin/registration-links/list') return Promise.resolve(rows)
    return Promise.resolve({})
  }
}

async function mountLoaded(rows: Row[] = [VALID_ROW, REVOKED_ROW]) {
  mock$fetch.mockImplementation(listFetch(rows))
  const wrapper = await mountSuspended(Page, { route: '/admin/links' })
  await vi.waitFor(() => {
    expect(wrapper.find('table').exists() || wrapper.text().includes('list.empty')).toBe(true)
  })
  return wrapper
}

describe('Page: Admin Links', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock$fetch.mockImplementation(listFetch([VALID_ROW, REVOKED_ROW]))
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      configurable: true,
    })
    mockWriteText.mockResolvedValue(undefined)
  })

  it('renders the loaded list', async () => {
    const wrapper = await mountLoaded()
    expect(wrapper.html()).toMatchSnapshot()
  })

  it('shows a loading state before the list resolves', async () => {
    mock$fetch.mockImplementation(() => new Promise(() => {}))
    const html = await (await renderSuspended(Page, { route: '/admin/links' })).html()
    expect(html).toContain('loading-dot')
  })

  it('lists links with creator, uses and status', async () => {
    const wrapper = await mountLoaded()
    expect(wrapper.text()).toContain('Flyer Herbstfest')
    expect(wrapper.text()).toContain('Admin Adam')
    // Falls back to email when the creator has no display name.
    expect(wrapper.text()).toContain('creator@example.com')
    // useCount / maxUses rendering.
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('pages.admin.links.status.valid')
    expect(wrapper.text()).toContain('pages.admin.links.status.revoked')
    // Unnamed fallback for the label-less row.
    expect(wrapper.text()).toContain('pages.admin.links.table.unnamed')
  })

  it('shows the empty state when there are no links', async () => {
    const wrapper = await mountLoaded([])
    expect(wrapper.text()).toContain('pages.admin.links.list.empty')
  })

  it('shows an error when loading fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/admin/registration-links/list') return Promise.reject(new Error('nope'))
      return Promise.resolve({})
    })
    const wrapper = await mountSuspended(Page, { route: '/admin/links' })
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.admin.links.list.error')
    })
    consoleSpy.mockRestore()
  })

  it('creates a link with label and max uses', async () => {
    const wrapper = await mountLoaded()
    await wrapper.find('#link-label').setValue('Neuer Link')
    await wrapper.find('#link-duration').setValue('7d')
    await wrapper.find('#link-max-uses').setValue(5)
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith(
        '/api/admin/registration-links/create',
        expect.objectContaining({
          method: 'POST',
          body: { label: 'Neuer Link', duration: '7d', maxUses: 5 },
        }),
      )
    })
  })

  it('creates a link with defaults (no label, unlimited uses)', async () => {
    const wrapper = await mountLoaded()
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith(
        '/api/admin/registration-links/create',
        expect.objectContaining({
          method: 'POST',
          body: { duration: '30d' },
        }),
      )
    })
  })

  it('shows an error when creating fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/admin/registration-links/list')
        return Promise.resolve([VALID_ROW, REVOKED_ROW])
      if (url === '/api/admin/registration-links/create') return Promise.reject(new Error('boom'))
      return Promise.resolve({})
    })
    const wrapper = await mountSuspended(Page, { route: '/admin/links' })
    await vi.waitFor(() => {
      expect(wrapper.find('table').exists()).toBe(true)
    })
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.admin.links.create.error')
    })
    consoleSpy.mockRestore()
  })

  it('revokes a link', async () => {
    const wrapper = await mountLoaded()
    const revokeButton = wrapper
      .findAll('button[type="button"]')
      .find((b) => b.text().includes('pages.admin.links.table.revoke'))
    await revokeButton!.trigger('click')
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith(
        '/api/admin/registration-links/revoke',
        expect.objectContaining({ method: 'POST', body: { token: 'tok-valid' } }),
      )
    })
  })

  it('handles a revoke failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/admin/registration-links/list')
        return Promise.resolve([VALID_ROW, REVOKED_ROW])
      if (url === '/api/admin/registration-links/revoke') return Promise.reject(new Error('boom'))
      return Promise.resolve({})
    })
    const wrapper = await mountSuspended(Page, { route: '/admin/links' })
    await vi.waitFor(() => {
      expect(wrapper.find('table').exists()).toBe(true)
    })
    const revokeButton = wrapper
      .findAll('button[type="button"]')
      .find((b) => b.text().includes('pages.admin.links.table.revoke'))
    await revokeButton!.trigger('click')
    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })
    consoleSpy.mockRestore()
  })

  it('copies a link url to the clipboard and shows feedback', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = await mountLoaded()
      const copyButton = wrapper
        .findAll('button[type="button"]')
        .find((b) => b.text().includes('pages.admin.links.table.copy'))
      await copyButton!.trigger('click')
      await vi.waitFor(() => {
        expect(mockWriteText).toHaveBeenCalledWith('http://localhost:3000/register/tok-valid')
      })
      await vi.waitFor(() => {
        expect(wrapper.text()).toContain('pages.admin.links.table.copied')
      })
      // Feedback clears after the timeout.
      vi.advanceTimersByTime(2100)
      await nextTick()
      expect(wrapper.text()).not.toContain('pages.admin.links.table.copied')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the newer copy feedback when an older timeout fires', async () => {
    const wrapper = await mountLoaded()
    vi.useFakeTimers()
    try {
      const copyButtons = wrapper
        .findAll('button[type="button"]')
        .filter((b) => b.text().includes('pages.admin.links.table.copy'))
      // Copy the first row, let its feedback show, then 1s later copy the second
      // row — which re-points copiedToken before the first timeout fires.
      await copyButtons[0]!.trigger('click')
      await vi.advanceTimersByTimeAsync(1000)
      await copyButtons[1]!.trigger('click')
      // Advance past the first row's 2s deadline. Its timeout fires but, since
      // copiedToken now belongs to the second row, it must NOT clear it.
      await vi.advanceTimersByTimeAsync(1200)
      expect(wrapper.text()).toContain('pages.admin.links.table.copied')
    } finally {
      vi.useRealTimers()
    }
  })

  it('handles a clipboard failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockWriteText.mockRejectedValue(new Error('denied'))
    const wrapper = await mountLoaded()
    const copyButton = wrapper
      .findAll('button[type="button"]')
      .find((b) => b.text().includes('pages.admin.links.table.copy'))
    await copyButton!.trigger('click')
    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })
    consoleSpy.mockRestore()
  })
})
