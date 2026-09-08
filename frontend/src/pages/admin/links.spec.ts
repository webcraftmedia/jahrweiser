import { mockNuxtImport, mountSuspended, renderSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import Page from './links.vue'

const mock$fetch = vi.fn()
vi.stubGlobal('$fetch', mock$fetch)

const mockWriteText = vi.fn()

// The logged-in admin. Owner-only actions (copy/edit/reactivate/delete) render
// only when this uid matches a row's createdByUid; the fixtures are owned by
// OWNER_UID, so the default session sees all of them.
const OWNER_UID = 'admin-1'
const mockUser = ref<{ uid?: string; role?: string } | null>({ uid: OWNER_UID, role: 'admin' })
mockNuxtImport('useUserSession', () => () => ({
  user: mockUser,
  loggedIn: ref(true),
  fetch: vi.fn(),
}))

interface Row {
  token: string
  label: string | null
  maxUses: number | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
  createdByUid: string
  createdByName: string | null
  createdByEmail: string | null
  useCount: number
  status: 'valid' | 'revoked' | 'expired' | 'exhausted'
  url: string
  calendars: string[] | null
  divergentUseCount: number
}

// Calendars the logged-in admin may hand out (their own X-ADMIN-TAGS), as the
// stable key plus its display label. Grants are stored by key; the label is
// purely what the human picks from.
const GRANTABLE = [
  { key: 'chor', label: 'Chor' },
  { key: 'vorstand', label: 'Vorstand' },
]
// Every calendar on the server, used to label a link's binding.
const ALL_CALENDARS = [
  { key: 'chor', name: 'Chor' },
  { key: 'vorstand', name: 'Vorstand' },
]

const VALID_ROW: Row = {
  token: 'tok-valid',
  label: 'Flyer Herbstfest',
  maxUses: 10,
  expiresAt: '2026-12-31T00:00:00.000Z',
  revokedAt: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  createdByUid: OWNER_UID,
  createdByName: 'Admin Adam',
  createdByEmail: 'admin@example.com',
  useCount: 3,
  status: 'valid',
  url: 'http://localhost:3000/register/tok-valid',
  calendars: ['chor'],
  divergentUseCount: 0,
}

const REVOKED_ROW: Row = {
  token: 'tok-revoked',
  label: null,
  maxUses: null,
  expiresAt: null,
  revokedAt: '2026-06-10T00:00:00.000Z',
  createdAt: '2026-05-01T00:00:00.000Z',
  createdByUid: OWNER_UID,
  createdByName: null,
  createdByEmail: 'creator@example.com',
  useCount: 0,
  status: 'revoked',
  url: 'http://localhost:3000/register/tok-revoked',
  calendars: null,
  divergentUseCount: 0,
}

function listFetch(rows: Row[], grantable: { key: string; label: string }[] = GRANTABLE) {
  return (url: string) => {
    if (url === '/api/admin/registration-links/list') return Promise.resolve(rows)
    if (url === '/api/admin/grantable-calendars') return Promise.resolve(grantable)
    if (url === '/api/calendars') return Promise.resolve(ALL_CALENDARS)
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
    mockUser.value = { uid: OWNER_UID, role: 'admin' }
    mock$fetch.mockImplementation(listFetch([VALID_ROW, REVOKED_ROW]))
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      configurable: true,
    })
    mockWriteText.mockResolvedValue(undefined)
  })

  function findButton(wrapper: Awaited<ReturnType<typeof mountLoaded>>, key: string) {
    return wrapper.findAll('button[type="button"]').find((b) => b.text().includes(key))
  }

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
          body: { label: 'Neuer Link', duration: '7d', maxUses: 5, calendars: [] },
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
          body: { duration: '30d', calendars: [] },
        }),
      )
    })
  })

  it('sends the selected calendar binding when creating', async () => {
    const wrapper = await mountLoaded()
    await vi.waitFor(() => {
      expect(wrapper.find('#link-calendar-vorstand').exists()).toBe(true)
    })
    await wrapper.find('#link-calendar-vorstand').setValue(true)
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith(
        '/api/admin/registration-links/create',
        expect.objectContaining({
          method: 'POST',
          body: { duration: '30d', calendars: ['vorstand'] },
        }),
      )
    })
  })

  it('offers only the calendars the admin may hand out', async () => {
    mock$fetch.mockImplementation(
      listFetch([VALID_ROW, REVOKED_ROW], [{ key: 'chor', label: 'Chor' }]),
    )
    const wrapper = await mountSuspended(Page, { route: '/admin/links' })
    await vi.waitFor(() => {
      expect(wrapper.find('#link-calendar-chor').exists()).toBe(true)
    })
    expect(wrapper.find('#link-calendar-vorstand').exists()).toBe(false)
  })

  it('hides the binding controls when the admin administers no calendar', async () => {
    mock$fetch.mockImplementation(listFetch([VALID_ROW, REVOKED_ROW], []))
    const wrapper = await mountSuspended(Page, { route: '/admin/links' })
    await vi.waitFor(() => {
      expect(wrapper.find('table').exists()).toBe(true)
    })
    expect(wrapper.find('fieldset').exists()).toBe(false)
  })

  it('shows the binding per row and a placeholder for unbound links', async () => {
    const wrapper = await mountLoaded()
    const rows = wrapper.findAll('tbody tr')
    expect(rows[0]!.text()).toContain('Chor')
    expect(rows[1]!.text()).toContain('pages.admin.links.table.noCalendars')
  })

  it('flags joins that received a different binding than the one shown', async () => {
    // The binding is editable, so the join count alone would be misleading.
    const wrapper = await mountLoaded([{ ...VALID_ROW, useCount: 3, divergentUseCount: 2 }])
    expect(wrapper.text()).toContain('pages.admin.links.table.divergent')
  })

  it('does not flag divergence when every join matches the current binding', async () => {
    const wrapper = await mountLoaded()
    expect(wrapper.text()).not.toContain('pages.admin.links.table.divergent')
  })

  it('saves a changed calendar binding', async () => {
    const wrapper = await mountLoaded()
    await findButton(wrapper, 'pages.admin.links.table.edit')!.trigger('click')
    // VALID_ROW is bound to Chor; add Vorstand.
    await wrapper.find('#edit-calendar-tok-valid-vorstand').setValue(true)
    await findButton(wrapper, 'pages.admin.links.table.save')!.trigger('click')
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith(
        '/api/admin/registration-links/update',
        expect.objectContaining({
          method: 'POST',
          body: {
            token: 'tok-valid',
            label: 'Flyer Herbstfest',
            calendars: ['chor', 'vorstand'],
          },
        }),
      )
    })
  })

  it('clears the binding when every calendar is unchecked', async () => {
    const wrapper = await mountLoaded()
    await findButton(wrapper, 'pages.admin.links.table.edit')!.trigger('click')
    await wrapper.find('#edit-calendar-tok-valid-chor').setValue(false)
    await findButton(wrapper, 'pages.admin.links.table.save')!.trigger('click')
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith(
        '/api/admin/registration-links/update',
        expect.objectContaining({
          method: 'POST',
          body: { token: 'tok-valid', label: 'Flyer Herbstfest', calendars: [] },
        }),
      )
    })
  })

  it('keeps working when the grantable calendars cannot be loaded', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/admin/registration-links/list')
        return Promise.resolve([VALID_ROW, REVOKED_ROW])
      if (url === '/api/admin/grantable-calendars') return Promise.reject(new Error('nope'))
      return Promise.resolve({})
    })
    const wrapper = await mountSuspended(Page, { route: '/admin/links' })
    await vi.waitFor(() => {
      expect(wrapper.find('table').exists()).toBe(true)
    })
    expect(wrapper.find('fieldset').exists()).toBe(false)
    consoleSpy.mockRestore()
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

  it('enters edit mode for a row', async () => {
    const wrapper = await mountLoaded()
    await findButton(wrapper, 'pages.admin.links.table.edit')!.trigger('click')
    expect(wrapper.find('table input[type="text"]').exists()).toBe(true)
    expect(wrapper.find('table select').exists()).toBe(true)
    expect(findButton(wrapper, 'pages.admin.links.table.save')).toBeDefined()
  })

  it('pre-fills an empty label when editing an unnamed link', async () => {
    const wrapper = await mountLoaded()
    const editButtons = wrapper
      .findAll('button[type="button"]')
      .filter((b) => b.text().includes('pages.admin.links.table.edit'))
    // Second row (REVOKED_ROW) has a null label.
    await editButtons[1]!.trigger('click')
    expect((wrapper.find('table input[type="text"]').element as HTMLInputElement).value).toBe('')
  })

  it('saves an edited label without changing validity', async () => {
    const wrapper = await mountLoaded()
    await findButton(wrapper, 'pages.admin.links.table.edit')!.trigger('click')
    await wrapper.find('table input[type="text"]').setValue('Renamed')
    await findButton(wrapper, 'pages.admin.links.table.save')!.trigger('click')
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith(
        '/api/admin/registration-links/update',
        expect.objectContaining({
          method: 'POST',
          body: { token: 'tok-valid', label: 'Renamed', calendars: ['chor'] },
        }),
      )
    })
  })

  it('saves an edited validity', async () => {
    const wrapper = await mountLoaded()
    await findButton(wrapper, 'pages.admin.links.table.edit')!.trigger('click')
    await wrapper.find('table select').setValue('7d')
    await findButton(wrapper, 'pages.admin.links.table.save')!.trigger('click')
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith(
        '/api/admin/registration-links/update',
        expect.objectContaining({
          method: 'POST',
          body: {
            token: 'tok-valid',
            label: 'Flyer Herbstfest',
            duration: '7d',
            calendars: ['chor'],
          },
        }),
      )
    })
  })

  it('cancels editing', async () => {
    const wrapper = await mountLoaded()
    await findButton(wrapper, 'pages.admin.links.table.edit')!.trigger('click')
    expect(findButton(wrapper, 'pages.admin.links.table.save')).toBeDefined()
    await findButton(wrapper, 'pages.admin.links.table.cancel')!.trigger('click')
    expect(findButton(wrapper, 'pages.admin.links.table.save')).toBeUndefined()
    expect(wrapper.find('table input[type="text"]').exists()).toBe(false)
  })

  it('handles an update failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/admin/registration-links/list')
        return Promise.resolve([VALID_ROW, REVOKED_ROW])
      if (url === '/api/admin/registration-links/update') return Promise.reject(new Error('boom'))
      return Promise.resolve({})
    })
    const wrapper = await mountSuspended(Page, { route: '/admin/links' })
    await vi.waitFor(() => {
      expect(wrapper.find('table').exists()).toBe(true)
    })
    await findButton(wrapper, 'pages.admin.links.table.edit')!.trigger('click')
    await findButton(wrapper, 'pages.admin.links.table.save')!.trigger('click')
    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })
    consoleSpy.mockRestore()
  })

  it('deletes an unused link', async () => {
    const wrapper = await mountLoaded()
    await findButton(wrapper, 'pages.admin.links.table.delete')!.trigger('click')
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith(
        '/api/admin/registration-links/delete',
        expect.objectContaining({ method: 'POST', body: { token: 'tok-revoked' } }),
      )
    })
  })

  it('handles a delete failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/admin/registration-links/list')
        return Promise.resolve([VALID_ROW, REVOKED_ROW])
      if (url === '/api/admin/registration-links/delete') return Promise.reject(new Error('boom'))
      return Promise.resolve({})
    })
    const wrapper = await mountSuspended(Page, { route: '/admin/links' })
    await vi.waitFor(() => {
      expect(wrapper.find('table').exists()).toBe(true)
    })
    await findButton(wrapper, 'pages.admin.links.table.delete')!.trigger('click')
    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })
    consoleSpy.mockRestore()
  })

  it('only offers delete for a deactivated link that was never redeemed', async () => {
    // A revoked link with redemptions can be reactivated but not deleted.
    const wrapper = await mountLoaded([{ ...REVOKED_ROW, useCount: 2 }])
    expect(findButton(wrapper, 'pages.admin.links.table.delete')).toBeUndefined()
    expect(findButton(wrapper, 'pages.admin.links.table.reactivate')).toBeDefined()
  })

  it('reactivates a deactivated link', async () => {
    const wrapper = await mountLoaded()
    await findButton(wrapper, 'pages.admin.links.table.reactivate')!.trigger('click')
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith(
        '/api/admin/registration-links/reactivate',
        expect.objectContaining({ method: 'POST', body: { token: 'tok-revoked' } }),
      )
    })
  })

  it('handles a reactivate failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/admin/registration-links/list')
        return Promise.resolve([VALID_ROW, REVOKED_ROW])
      if (url === '/api/admin/registration-links/reactivate')
        return Promise.reject(new Error('boom'))
      return Promise.resolve({})
    })
    const wrapper = await mountSuspended(Page, { route: '/admin/links' })
    await vi.waitFor(() => {
      expect(wrapper.find('table').exists()).toBe(true)
    })
    await findButton(wrapper, 'pages.admin.links.table.reactivate')!.trigger('click')
    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })
    consoleSpy.mockRestore()
  })

  describe('owner-only actions', () => {
    // An admin who didn't create the links sees them, can deactivate them, but
    // gets no copy/edit/reactivate/delete buttons (server enforces this too).
    beforeEach(() => {
      mockUser.value = { uid: 'admin-2', role: 'admin' }
    })

    it('hides copy and edit for a non-owner on an active link', async () => {
      const wrapper = await mountLoaded()
      expect(findButton(wrapper, 'pages.admin.links.table.copy')).toBeUndefined()
      expect(findButton(wrapper, 'pages.admin.links.table.edit')).toBeUndefined()
    })

    it('still offers deactivate to a non-owner', async () => {
      const wrapper = await mountLoaded()
      expect(findButton(wrapper, 'pages.admin.links.table.revoke')).toBeDefined()
    })

    it('hides reactivate and delete for a non-owner on a deactivated link', async () => {
      const wrapper = await mountLoaded([REVOKED_ROW])
      expect(findButton(wrapper, 'pages.admin.links.table.reactivate')).toBeUndefined()
      expect(findButton(wrapper, 'pages.admin.links.table.delete')).toBeUndefined()
    })
  })
})
