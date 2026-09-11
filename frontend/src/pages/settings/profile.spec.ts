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

/** The postal codes the map knows in these tests, and the places they name. */
const KNOWN: Record<string, string> = { '12345': 'Musterstadt', '54321': 'Andernorts' }

interface ServeOptions {
  save?: 'ok' | { statusMessage?: string }
  /** Make the postal-code lookup itself fail, rather than answer "unknown". */
  lookupFails?: boolean
}

function serving(profile: unknown, options: ServeOptions = {}) {
  const { save = 'ok', lookupFails = false } = options
  mock$fetch.mockImplementation(
    (url: string, opts?: { method?: string; query?: { plz?: string } }) => {
      if (url === '/api/map/postal-code') {
        if (lookupFails) return Promise.reject(new Error('offline'))
        const plz = String(opts?.query?.plz ?? '')
        const ort = KNOWN[plz]
        return Promise.resolve({ known: Boolean(ort), plz: ort ? plz : null, ort: ort ?? null })
      }
      if (opts?.method === 'POST') {
        if (save === 'ok') return Promise.resolve({})
        return Promise.reject(Object.assign(new Error('boom'), { data: save }))
      }
      return profile instanceof Error ? Promise.reject(profile) : Promise.resolve(profile)
    },
  )
}

/**
 * Mount and wait for the profile to arrive — the page renders before it does —
 * and for the postal code it brought to be checked. Both have settled by the
 * time a member could touch the form, so the tests start where they do.
 */
async function mountPage() {
  const wrapper = await mountSuspended(Page, { route: '/settings/profile' })
  await vi.waitFor(() => {
    expect(wrapper.text()).not.toContain('pages.settings.loading')
  })
  await settled(wrapper)
  return wrapper
}

/** Wait out the debounce and the lookup behind it. */
async function settled(wrapper: { text: () => string }) {
  await vi.waitFor(() => {
    expect(wrapper.text()).not.toContain('pages.settings.profile.postalCode-checking')
  })
  await nextTick()
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
    // useState is shared between mounts; the rail's marker would leak.
    useState<boolean | null>('member-map-has-plz', () => null).value = null
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
    serving(PROFILE, { save: { statusMessage: 'Contact not found' } })
    const wrapper = await mountPage()
    await fields(wrapper).first.setValue('Erika Maria')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Contact not found')
    })
    expect(wrapper.text()).toContain('pages.settings.profile.error')
  })

  it('falls back to the generic message when the server gives no reason', async () => {
    serving(PROFILE, { save: {} })
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

  describe('postal-code validation', () => {
    // The map is the only consumer of this field, and it can only draw codes it
    // has geometry for — so the map's own data is what the form checks against.
    it('confirms a code the map knows, with the place it names', async () => {
      const wrapper = await mountPage()
      expect(mock$fetch).toHaveBeenCalledWith('/api/map/postal-code', { query: { plz: '12345' } })
      expect(wrapper.find('#settings-postalCode-state').text()).toBe(
        'pages.settings.profile.postalCode-known',
      )
      expect(wrapper.find('#settings-postalCode').attributes('aria-invalid')).toBeUndefined()
    })

    it('refuses to save a code that is not five digits, without asking', async () => {
      const wrapper = await mountPage()
      await fields(wrapper).postal.setValue('123')
      await settled(wrapper)
      expect(wrapper.find('#settings-postalCode-state').text()).toBe(
        'pages.settings.profile.postalCode-format',
      )
      expect(fields(wrapper).submit.attributes('disabled')).toBeDefined()
      // The shape is decidable here; a request for it would be a round trip
      // spent on something the browser already knows.
      expect(mock$fetch).not.toHaveBeenCalledWith('/api/map/postal-code', {
        query: { plz: '123' },
      })
    })

    it('refuses to save five digits the map has no area for', async () => {
      // The mistake a format check cannot catch, and the whole reason the check
      // goes to the map rather than to a regex.
      const wrapper = await mountPage()
      await fields(wrapper).postal.setValue('99999')
      await settled(wrapper)
      expect(wrapper.find('#settings-postalCode-state').text()).toBe(
        'pages.settings.profile.postalCode-unknown',
      )
      expect(wrapper.find('#settings-postalCode').attributes('aria-invalid')).toBe('true')
      expect(fields(wrapper).submit.attributes('disabled')).toBeDefined()
    })

    it('blocks the name fields too while the code is wrong', async () => {
      // Saving would post the bad code along and be refused; there is no way to
      // change the name past a code the endpoint will not take.
      const wrapper = await mountPage()
      await fields(wrapper).postal.setValue('99999')
      await fields(wrapper).first.setValue('Erika Maria')
      await settled(wrapper)
      expect(fields(wrapper).submit.attributes('disabled')).toBeDefined()
    })

    it('asks once for a code that was typed digit by digit', async () => {
      const wrapper = await mountPage()
      for (const value of ['5', '54', '543', '5432', '54321']) {
        await fields(wrapper).postal.setValue(value)
      }
      await settled(wrapper)
      const asked = mock$fetch.mock.calls.filter(([url]) => url === '/api/map/postal-code')
      // One for the code the profile arrived with, one for what was typed.
      expect(asked).toHaveLength(2)
      expect(asked[1]).toStrictEqual(['/api/map/postal-code', { query: { plz: '54321' } }])
    })

    it('lets the member save when the check itself is unavailable', async () => {
      // A flaky lookup must not lock the form. The endpoint that stores the
      // value validates it regardless, so nothing bad gets through this way.
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      serving(PROFILE, { lookupFails: true })
      const wrapper = await mountPage()
      await fields(wrapper).first.setValue('Erika Maria')
      expect(wrapper.find('#settings-postalCode-state').text()).toBe(
        'pages.settings.profile.postalCode-unchecked',
      )
      expect(fields(wrapper).submit.attributes('disabled')).toBeUndefined()
      error.mockRestore()
    })

    it('marks the field when the server is the one to refuse the code', async () => {
      // Reachable when the lookup was unavailable and the save was not — the
      // rejection belongs at the field, not in a line under the button.
      serving(PROFILE, { save: { statusMessage: 'invalid-postal-code' } })
      const wrapper = await mountPage()
      await fields(wrapper).postal.setValue('54321')
      await settled(wrapper)
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => {
        expect(wrapper.find('#settings-postalCode-state').text()).toBe(
          'pages.settings.profile.postalCode-unknown',
        )
      })
      // Not also a generic failure under the button: one rejection, one message.
      expect(wrapper.text()).not.toContain('pages.settings.profile.error')
    })
  })

  describe('the map marker in the icon rail', () => {
    // Point 2 of the brief: the rail's dot has to answer to the save, not to
    // the next full page load — the member is looking straight at it.
    const marker = () => useState<boolean | null>('member-map-has-plz', () => null)

    it('clears once a postal code has been stored', async () => {
      marker().value = false
      const wrapper = await mountPage()
      await fields(wrapper).postal.setValue('54321')
      await settled(wrapper)
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => {
        expect(wrapper.text()).toContain('pages.settings.profile.saved')
      })
      expect(marker().value).toBe(true)
    })

    it('appears again when the code is deleted', async () => {
      marker().value = true
      const wrapper = await mountPage()
      await fields(wrapper).postal.setValue('')
      await settled(wrapper)
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => {
        expect(wrapper.text()).toContain('pages.settings.profile.saved')
      })
      expect(marker().value).toBe(false)
    })

    it('is left alone when the save failed', async () => {
      marker().value = false
      serving(PROFILE, { save: { statusMessage: 'Contact not found' } })
      const wrapper = await mountPage()
      await fields(wrapper).postal.setValue('54321')
      await settled(wrapper)
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => {
        expect(wrapper.text()).toContain('Contact not found')
      })
      expect(marker().value).toBe(false)
    })
  })
})
