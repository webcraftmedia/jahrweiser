import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { stubApi } from '../../../test/helpers/stub-api'

import Page from './telegram.vue'

import type { VueWrapper } from '@vue/test-utils'

const mock$fetch = vi.fn()
stubApi(mock$fetch)

const CHANNELS = [
  {
    id: 1,
    name: 'Kultur-Steher',
    description: 'Orga und Termine',
    url: 'https://t.me/+AbCdEf',
    public: false,
  },
  { id: 2, name: 'GG&G Info', url: 'https://t.me/ggg_info', public: true },
]

function fetchDefaults() {
  return (url: string) => {
    if (url === '/api/telegram-channels') return Promise.resolve(CHANNELS)
    return Promise.resolve({})
  }
}

async function mountLoaded() {
  const wrapper = await mountSuspended(Page, { route: '/admin/telegram' })
  await vi.waitFor(() => {
    expect(wrapper.find('ul').exists()).toBe(true)
  })
  return wrapper
}

async function fill(wrapper: VueWrapper, selector: string, value: string): Promise<void> {
  await wrapper.find(selector).setValue(value)
}

/** The body of the first call to `url`. */
function sentTo(url: string): Record<string, unknown> {
  const call = mock$fetch.mock.calls.find(([called]) => called === url)
  return (call![1] as { body: Record<string, unknown> }).body
}

function submitButton(wrapper: VueWrapper) {
  return wrapper.find('form button[type="submit"]')
}

describe('Page: Admin Telegram', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock$fetch.mockImplementation(fetchDefaults())
    // The list lives in useState, shared with /telegram and the icon rail.
    useState<unknown[]>('telegram-channels', () => []).value = []
    useState('telegram-channels-loaded', () => false).value = false
    useState('telegram-channels-error', () => false).value = false
  })

  describe('adding a channel', () => {
    it('refuses to submit before there is a name and a link', async () => {
      const wrapper = await mountLoaded()
      expect(submitButton(wrapper).attributes('disabled')).toBeDefined()

      await fill(wrapper, '#channel-name', 'Neuer Kanal')
      expect(submitButton(wrapper).attributes('disabled')).toBeDefined()

      await fill(wrapper, '#channel-url', 'https://t.me/neu')
      expect(submitButton(wrapper).attributes('disabled')).toBeUndefined()
    })

    it.each([
      ['https://example.com/phish', 'a link somewhere else entirely'],
      ['https://t.me/', 'the bare prefix without a channel'],
    ])('blocks %s (%s) and says why', async (url) => {
      // The same check the endpoint runs, so the form never offers to send
      // something the server would refuse.
      const wrapper = await mountLoaded()
      await fill(wrapper, '#channel-name', 'Neuer Kanal')
      await fill(wrapper, '#channel-url', url)
      expect(wrapper.text()).toContain('pages.admin.telegram.field.url-invalid')
      expect(submitButton(wrapper).attributes('disabled')).toBeDefined()
    })

    it('sends nothing when the form is submitted incomplete', async () => {
      // The button is disabled, but Enter in a text field submits anyway.
      const wrapper = await mountLoaded()
      await fill(wrapper, '#channel-name', 'Neuer Kanal')
      await wrapper.find('form').trigger('submit')
      expect(mock$fetch).not.toHaveBeenCalledWith(
        '/api/admin/telegram-channels/create',
        expect.anything(),
      )
    })

    it('stays quiet about the link while nothing has been typed', async () => {
      const wrapper = await mountLoaded()
      expect(wrapper.text()).not.toContain('pages.admin.telegram.field.url-invalid')
    })

    it('sends the trimmed fields and reloads the list', async () => {
      const wrapper = await mountLoaded()
      await fill(wrapper, '#channel-name', '  Neuer Kanal  ')
      await fill(wrapper, '#channel-url', 'https://t.me/neu')
      await fill(wrapper, '#channel-description', '  Für alle  ')
      await wrapper.find('#channel-public').setValue(true)
      await wrapper.find('form').trigger('submit')

      await vi.waitFor(() => {
        expect(mock$fetch).toHaveBeenCalledWith(
          '/api/admin/telegram-channels/create',
          expect.objectContaining({ method: 'POST' }),
        )
      })
      expect(sentTo('/api/admin/telegram-channels/create')).toStrictEqual({
        name: 'Neuer Kanal',
        description: 'Für alle',
        url: 'https://t.me/neu',
        public: true,
      })
      // Reloaded, so the icon rail learns about the first channel.
      expect(
        mock$fetch.mock.calls.filter(([url]) => url === '/api/telegram-channels'),
      ).toHaveLength(2)
    })

    it('omits an untouched description instead of sending an empty string', async () => {
      const wrapper = await mountLoaded()
      await fill(wrapper, '#channel-name', 'Neuer Kanal')
      await fill(wrapper, '#channel-url', 'https://t.me/neu')
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => {
        expect(mock$fetch).toHaveBeenCalledWith(
          '/api/admin/telegram-channels/create',
          expect.anything(),
        )
      })
      expect(sentTo('/api/admin/telegram-channels/create').description).toBeUndefined()
    })

    it('clears the form after a successful save', async () => {
      const wrapper = await mountLoaded()
      await fill(wrapper, '#channel-name', 'Neuer Kanal')
      await fill(wrapper, '#channel-url', 'https://t.me/neu')
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => {
        expect((wrapper.find('#channel-name').element as HTMLInputElement).value).toBe('')
      })
    })

    it('says so when saving fails and keeps what was typed', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mock$fetch.mockImplementation((url: string) => {
        if (url === '/api/admin/telegram-channels/create') return Promise.reject(new Error('boom'))
        return fetchDefaults()(url)
      })
      const wrapper = await mountLoaded()
      await fill(wrapper, '#channel-name', 'Neuer Kanal')
      await fill(wrapper, '#channel-url', 'https://t.me/neu')
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => {
        expect(wrapper.text()).toContain('pages.admin.telegram.create.error')
      })
      // Losing the input on a failed save would be the second annoyance.
      expect((wrapper.find('#channel-name').element as HTMLInputElement).value).toBe('Neuer Kanal')
      consoleSpy.mockRestore()
    })
  })

  describe('the existing channels', () => {
    it('lists them with their link and their badge', async () => {
      const wrapper = await mountLoaded()
      const rows = wrapper.findAll('li')
      expect(rows).toHaveLength(2)
      expect(rows[0]!.text()).toContain('Kultur-Steher')
      expect(rows[0]!.text()).toContain('https://t.me/+AbCdEf')
      expect(rows[0]!.text()).toContain('pages.telegram.badge.invite')
      expect(rows[1]!.text()).toContain('pages.telegram.badge.public')
    })

    it('shows the empty state before the first channel exists', async () => {
      mock$fetch.mockImplementation((url: string) =>
        Promise.resolve(url === '/api/telegram-channels' ? [] : {}),
      )
      const wrapper = await mountSuspended(Page, { route: '/admin/telegram' })
      await vi.waitFor(() => {
        expect(wrapper.text()).toContain('pages.admin.telegram.list.empty')
      })
    })

    it('says so when the list cannot be loaded', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mock$fetch.mockImplementation((url: string) => {
        if (url === '/api/telegram-channels') return Promise.reject(new Error('boom'))
        return Promise.resolve({})
      })
      const wrapper = await mountSuspended(Page, { route: '/admin/telegram' })
      await vi.waitFor(() => {
        expect(wrapper.text()).toContain('pages.admin.telegram.list.error')
      })
      consoleSpy.mockRestore()
    })
  })

  describe('editing a channel', () => {
    async function startEditingFirst(wrapper: VueWrapper): Promise<void> {
      const buttons = wrapper.findAll('li')[0]!.findAll('button')
      await buttons
        .find((button) => button.text() === 'pages.admin.telegram.list.edit')!
        .trigger('click')
    }

    it('opens the row in place, prefilled with what is stored', async () => {
      const wrapper = await mountLoaded()
      await startEditingFirst(wrapper)
      const inputs = wrapper.findAll('li')[0]!.findAll('input')
      expect((inputs[0]!.element as HTMLInputElement).value).toBe('Kultur-Steher')
      expect((inputs[1]!.element as HTMLInputElement).value).toBe('https://t.me/+AbCdEf')
      expect((inputs[2]!.element as HTMLInputElement).value).toBe('Orga und Termine')
    })

    it('sends the id with the edited fields', async () => {
      const wrapper = await mountLoaded()
      await startEditingFirst(wrapper)
      const row = wrapper.findAll('li')[0]!
      await row.findAll('input')[0]!.setValue('Kultur-Steher neu')
      await row.find('form').trigger('submit')
      await vi.waitFor(() => {
        expect(mock$fetch).toHaveBeenCalledWith(
          '/api/admin/telegram-channels/update',
          expect.anything(),
        )
      })
      expect(sentTo('/api/admin/telegram-channels/update')).toMatchObject({
        id: 1,
        name: 'Kultur-Steher neu',
      })
    })

    it('leaves the description field empty for a channel that has none', async () => {
      const wrapper = await mountLoaded()
      const buttons = wrapper.findAll('li')[1]!.findAll('button')
      await buttons
        .find((button) => button.text() === 'pages.admin.telegram.list.edit')!
        .trigger('click')
      const inputs = wrapper.findAll('li')[1]!.findAll('input')
      expect((inputs[2]!.element as HTMLInputElement).value).toBe('')
    })

    it('blocks saving a link that is not a Telegram link', async () => {
      const wrapper = await mountLoaded()
      await startEditingFirst(wrapper)
      const row = wrapper.findAll('li')[0]!
      await row.findAll('input')[1]!.setValue('https://example.com/phish')
      expect(row.text()).toContain('pages.admin.telegram.field.url-invalid')
      await row.find('form').trigger('submit')
      expect(mock$fetch).not.toHaveBeenCalledWith(
        '/api/admin/telegram-channels/update',
        expect.anything(),
      )
    })

    it('says so when saving fails and keeps the editor open', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mock$fetch.mockImplementation((url: string) => {
        if (url === '/api/admin/telegram-channels/update') return Promise.reject(new Error('boom'))
        return fetchDefaults()(url)
      })
      const wrapper = await mountLoaded()
      await startEditingFirst(wrapper)
      await wrapper.findAll('li')[0]!.find('form').trigger('submit')
      await vi.waitFor(() => {
        expect(wrapper.text()).toContain('pages.admin.telegram.list.save-error')
      })
      // Still editing — closing the row would throw away the change.
      expect(wrapper.findAll('li')[0]!.find('form').exists()).toBe(true)
      consoleSpy.mockRestore()
    })

    it('carries the description and the public flag through the editor', async () => {
      const wrapper = await mountLoaded()
      await startEditingFirst(wrapper)
      const row = wrapper.findAll('li')[0]!
      await row.findAll('input')[2]!.setValue('Neue Beschreibung')
      await row.find('input[type="checkbox"]').setValue(true)
      await row.find('form').trigger('submit')
      await vi.waitFor(() => {
        expect(mock$fetch).toHaveBeenCalledWith(
          '/api/admin/telegram-channels/update',
          expect.anything(),
        )
      })
      expect(sentTo('/api/admin/telegram-channels/update')).toMatchObject({
        description: 'Neue Beschreibung',
        public: true,
      })
    })

    it('closes the editor without saving when cancelled', async () => {
      const wrapper = await mountLoaded()
      await startEditingFirst(wrapper)
      const cancel = wrapper
        .findAll('li')[0]!
        .findAll('button')
        .find((button) => button.text() === 'pages.admin.telegram.list.cancel')!
      await cancel.trigger('click')
      expect(wrapper.findAll('li')[0]!.find('form').exists()).toBe(false)
      expect(mock$fetch).not.toHaveBeenCalledWith(
        '/api/admin/telegram-channels/update',
        expect.anything(),
      )
    })
  })

  describe('ordering', () => {
    function arrows(wrapper: VueWrapper, index: number) {
      const buttons = wrapper.findAll('li')[index]!.findAll('button')
      return { up: buttons[0]!, down: buttons[1]! }
    }

    it('cannot move the first channel up or the last one down', async () => {
      // Nothing to swap with — the buttons say so instead of failing silently.
      const wrapper = await mountLoaded()
      expect(arrows(wrapper, 0).up.attributes('disabled')).toBeDefined()
      expect(arrows(wrapper, 0).down.attributes('disabled')).toBeUndefined()
      expect(arrows(wrapper, 1).up.attributes('disabled')).toBeUndefined()
      expect(arrows(wrapper, 1).down.attributes('disabled')).toBeDefined()
    })

    it('moves a channel down as well as up', async () => {
      const wrapper = await mountLoaded()
      await arrows(wrapper, 0).down.trigger('click')
      await vi.waitFor(() => {
        expect(mock$fetch).toHaveBeenCalledWith(
          '/api/admin/telegram-channels/move',
          expect.anything(),
        )
      })
      expect(sentTo('/api/admin/telegram-channels/move')).toStrictEqual({
        id: 1,
        direction: 'down',
      })
    })

    it('says so when the move fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mock$fetch.mockImplementation((url: string) => {
        if (url === '/api/admin/telegram-channels/move') return Promise.reject(new Error('boom'))
        return fetchDefaults()(url)
      })
      const wrapper = await mountLoaded()
      await arrows(wrapper, 1).up.trigger('click')
      await vi.waitFor(() => {
        expect(wrapper.text()).toContain('pages.admin.telegram.list.action-error')
      })
      consoleSpy.mockRestore()
    })

    it('asks the server to move one row, not to reorder the whole list', async () => {
      // A stale page must not be able to overwrite the current order.
      const wrapper = await mountLoaded()
      await arrows(wrapper, 1).up.trigger('click')
      await vi.waitFor(() => {
        expect(mock$fetch).toHaveBeenCalledWith(
          '/api/admin/telegram-channels/move',
          expect.anything(),
        )
      })
      expect(sentTo('/api/admin/telegram-channels/move')).toStrictEqual({ id: 2, direction: 'up' })
    })
  })

  describe('deleting a channel', () => {
    function deleteButton(wrapper: VueWrapper, label: string) {
      return wrapper
        .findAll('li')[0]!
        .findAll('button')
        .find((button) => button.text() === label)
    }

    it('asks again — a private invite link cannot be looked up twice', async () => {
      const wrapper = await mountLoaded()
      await deleteButton(wrapper, 'pages.admin.telegram.list.delete')!.trigger('click')
      expect(wrapper.text()).toContain('pages.admin.telegram.list.delete-confirm')
      expect(mock$fetch).not.toHaveBeenCalledWith(
        '/api/admin/telegram-channels/delete',
        expect.anything(),
      )
    })

    it('deletes after the second click and reloads', async () => {
      const wrapper = await mountLoaded()
      await deleteButton(wrapper, 'pages.admin.telegram.list.delete')!.trigger('click')
      await deleteButton(wrapper, 'pages.admin.telegram.list.delete-confirm')!.trigger('click')
      await vi.waitFor(() => {
        expect(mock$fetch).toHaveBeenCalledWith('/api/admin/telegram-channels/delete', {
          method: 'POST',
          body: { id: 1 },
        })
      })
      expect(
        mock$fetch.mock.calls.filter(([url]) => url === '/api/telegram-channels'),
      ).toHaveLength(2)
    })

    it('lets the admin back out', async () => {
      const wrapper = await mountLoaded()
      await deleteButton(wrapper, 'pages.admin.telegram.list.delete')!.trigger('click')
      await deleteButton(wrapper, 'pages.admin.telegram.list.cancel')!.trigger('click')
      expect(wrapper.text()).not.toContain('pages.admin.telegram.list.delete-confirm')
      expect(mock$fetch).not.toHaveBeenCalledWith(
        '/api/admin/telegram-channels/delete',
        expect.anything(),
      )
    })

    it('says so when the delete fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mock$fetch.mockImplementation((url: string) => {
        if (url === '/api/admin/telegram-channels/delete') return Promise.reject(new Error('boom'))
        return fetchDefaults()(url)
      })
      const wrapper = await mountLoaded()
      await deleteButton(wrapper, 'pages.admin.telegram.list.delete')!.trigger('click')
      await deleteButton(wrapper, 'pages.admin.telegram.list.delete-confirm')!.trigger('click')
      await vi.waitFor(() => {
        expect(wrapper.text()).toContain('pages.admin.telegram.list.action-error')
      })
      consoleSpy.mockRestore()
    })
  })
})
