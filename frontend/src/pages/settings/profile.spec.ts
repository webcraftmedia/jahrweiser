import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { stubApi } from '../../../test/helpers/stub-api'

import Page from './profile.vue'

const mock$fetch = vi.fn()
stubApi(mock$fetch)

const mockRefreshSession = vi.hoisted(() => vi.fn())
const mockUserName = vi.hoisted(() => ({ value: 'Erika Musterfrau' }))

mockNuxtImport('useUserSession', () => () => ({
  ready: computed(() => true),
  loggedIn: computed(() => true),
  user: computed(() => ({ name: mockUserName.value })),
  session: ref(null),
  fetch: mockRefreshSession,
  openInPopup: vi.fn(),
  clear: vi.fn(),
}))

const PROFILE = { firstName: 'Erika', lastName: 'Musterfrau', postalCode: '12345' }

function serving(profile: unknown, save: 'ok' | { statusMessage?: string } = 'ok') {
  mock$fetch.mockImplementation((_url: string, opts?: { method?: string }) => {
    if (opts?.method === 'POST') {
      if (save === 'ok') return Promise.resolve({})
      return Promise.reject(Object.assign(new Error('boom'), { data: save }))
    }
    return profile instanceof Error ? Promise.reject(profile) : Promise.resolve(profile)
  })
}

/** Mount and wait for the profile to arrive — the page renders before it does. */
async function mountPage() {
  const wrapper = await mountSuspended(Page, { route: '/settings/profile' })
  await vi.waitFor(() => {
    expect(wrapper.text()).not.toContain('pages.settings.loading')
  })
  return wrapper
}

function fields(wrapper: Awaited<ReturnType<typeof mountPage>>) {
  return {
    first: wrapper.find('#settings-firstName'),
    last: wrapper.find('#settings-lastName'),
    postal: wrapper.find('#settings-postalCode'),
    submit: wrapper.find('button[type="submit"]'),
  }
}

describe('Page: Profil-Einstellungen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUserName.value = 'Erika Musterfrau'
    mockRefreshSession.mockResolvedValue(undefined)
    serving(PROFILE)
  })

  it('says it is loading before the profile arrives', async () => {
    mock$fetch.mockImplementation(() => new Promise(() => {}))
    const wrapper = await mountSuspended(Page, { route: '/settings/profile' })
    expect(wrapper.text()).toContain('pages.settings.loading')
    // No form to edit yet, so nothing to submit either.
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('prefills the form from the stored profile', async () => {
    const wrapper = await mountPage()
    const { first, last, postal } = fields(wrapper)
    expect((first.element as HTMLInputElement).value).toBe('Erika')
    expect((last.element as HTMLInputElement).value).toBe('Musterfrau')
    expect((postal.element as HTMLInputElement).value).toBe('12345')
  })

  it('falls back to the session name when the profile cannot be loaded', async () => {
    // A broken endpoint must not look like an empty profile — the user would
    // "correct" it and overwrite good data with nothing.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    serving(new Error('offline'))
    const wrapper = await mountPage()
    const { first, last } = fields(wrapper)
    expect((first.element as HTMLInputElement).value).toBe('Erika')
    expect((last.element as HTMLInputElement).value).toBe('Musterfrau')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('treats a single-word session name as the first name', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockUserName.value = 'Erika'
    serving(new Error('offline'))
    const wrapper = await mountPage()
    const { first, last } = fields(wrapper)
    expect((first.element as HTMLInputElement).value).toBe('Erika')
    expect((last.element as HTMLInputElement).value).toBe('')
    warn.mockRestore()
  })

  it('leaves the form empty when the session has no name either', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockUserName.value = undefined as unknown as string
    serving(new Error('offline'))
    const wrapper = await mountPage()
    const { first, last } = fields(wrapper)
    expect((first.element as HTMLInputElement).value).toBe('')
    expect((last.element as HTMLInputElement).value).toBe('')
    warn.mockRestore()
  })

  it('saves an edited last name', async () => {
    const wrapper = await mountPage()
    await fields(wrapper).last.setValue('Mustermann')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.settings.profile.saved')
    })
    expect(mock$fetch).toHaveBeenCalledWith('/api/me/profile', {
      method: 'POST',
      body: { firstName: 'Erika', lastName: 'Mustermann', postalCode: '12345' },
    })
  })

  it('offers nothing to save until something changes', async () => {
    const wrapper = await mountPage()
    expect(fields(wrapper).submit.attributes('disabled')).toBeDefined()

    await fields(wrapper).first.setValue('Erika Maria')
    expect(fields(wrapper).submit.attributes('disabled')).toBeUndefined()
  })

  it('counts clearing a field as a change', async () => {
    // Emptying the postal code is how you delete it; the form has to let you.
    const wrapper = await mountPage()
    await fields(wrapper).postal.setValue('')
    expect(fields(wrapper).submit.attributes('disabled')).toBeUndefined()
  })

  it('saves, confirms and disables itself again', async () => {
    const wrapper = await mountPage()
    await fields(wrapper).first.setValue('Erika Maria')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.settings.profile.saved')
    })
    expect(mock$fetch).toHaveBeenCalledWith('/api/me/profile', {
      method: 'POST',
      body: { firstName: 'Erika Maria', lastName: 'Musterfrau', postalCode: '12345' },
    })
    // The values are now the persisted ones, so there is nothing left to save.
    expect(fields(wrapper).submit.attributes('disabled')).toBeDefined()
    expect(mockRefreshSession).toHaveBeenCalled()
  })

  it('still reports success when refreshing the session fails', async () => {
    // The greeting in the header staying stale is not a failed save.
    mockRefreshSession.mockRejectedValue(new Error('session gone'))
    const wrapper = await mountPage()
    await fields(wrapper).first.setValue('Erika Maria')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.settings.profile.saved')
    })
  })

  it("surfaces the server's reason when the save is rejected", async () => {
    serving(PROFILE, { statusMessage: 'Contact not found' })
    const wrapper = await mountPage()
    await fields(wrapper).first.setValue('Erika Maria')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Contact not found')
    })
    expect(wrapper.text()).toContain('pages.settings.profile.error')
  })

  it('falls back to the generic message when the server gives no reason', async () => {
    serving(PROFILE, {})
    const wrapper = await mountPage()
    await fields(wrapper).first.setValue('Erika Maria')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.settings.profile.error')
    })
    expect(wrapper.text()).not.toContain('(')
  })

  it('ignores a submit while nothing has changed', async () => {
    const wrapper = await mountPage()
    await wrapper.find('form').trigger('submit')
    expect(mock$fetch).not.toHaveBeenCalledWith(
      '/api/me/profile',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
