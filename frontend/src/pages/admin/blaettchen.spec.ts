import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Page from './blaettchen.vue'

import type { VueWrapper } from '@vue/test-utils'

const mock$fetch = vi.fn()
vi.stubGlobal('$fetch', mock$fetch)

const LISTING = {
  issues: [
    { number: 12, date: '2026-05-01', file: '12_2026-05-01.pdf' },
    {
      number: 4,
      date: '2023-12-23',
      title: 'Sonderausgabe Weihnachten',
      file: '04_2023-12-23_Sonderausgabe Weihnachten.pdf',
    },
  ],
  contact: 'redaktion@example.com',
}

function fetchDefaults() {
  return (url: string) => {
    if (url === '/api/blaettchen') return Promise.resolve(LISTING)
    return Promise.resolve({})
  }
}

async function mountLoaded() {
  const wrapper = await mountSuspended(Page, { route: '/admin/blaettchen' })
  await vi.waitFor(() => {
    expect(wrapper.find('ul').exists()).toBe(true)
  })
  return wrapper
}

/**
 * Picks a file the way a browser does — jsdom has no DataTransfer, so the
 * FileList is planted on the input directly.
 */
async function choose(wrapper: VueWrapper, name: string): Promise<void> {
  const input = wrapper.find('#blaettchen-file')
  const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, {
    type: 'application/pdf',
  })
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
}

function field(wrapper: VueWrapper, id: string): string {
  return (wrapper.find(id).element as HTMLInputElement).value
}

async function fill(wrapper: VueWrapper, id: string, value: string): Promise<void> {
  await wrapper.find(id).setValue(value)
}

/** The FormData the upload was sent with. */
function uploadedForm(): FormData {
  const call = mock$fetch.mock.calls.find(([url]) => url === '/api/admin/blaettchen/upload')
  return (call![1] as { body: FormData }).body
}

describe('Page: Admin Blättchen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock$fetch.mockImplementation(fetchDefaults())
    useState<unknown[]>('blaettchen-issues', () => []).value = []
    useState<string | null>('blaettchen-contact', () => null).value = null
    useState('blaettchen-loaded', () => false).value = false
    useState('blaettchen-error', () => false).value = false
  })

  describe('prefilling from the file name', () => {
    it('fills number, date and subtitle from a name that follows the convention', async () => {
      const wrapper = await mountLoaded()
      await choose(wrapper, '13_2026-09-01_Herbstausgabe.pdf')
      expect(field(wrapper, '#blaettchen-number')).toBe('13')
      expect(field(wrapper, '#blaettchen-date')).toBe('2026-09-01')
      expect(field(wrapper, '#blaettchen-title')).toBe('Herbstausgabe')
      // Says so, rather than leaving the editor to wonder where that came from.
      expect(wrapper.text()).toContain('pages.admin.blaettchen.upload.prefilled')
    })

    it('leaves the fields to the editor for the old-style names', async () => {
      // "GG&G Blaettche 2026-12.pdf" carries a month that is not the
      // publication date — guessing from it would be worse than not guessing.
      const wrapper = await mountLoaded()
      await choose(wrapper, 'GG&G Blaettche 2026-12.pdf')
      expect(field(wrapper, '#blaettchen-number')).toBe('')
      expect(field(wrapper, '#blaettchen-date')).toBe('')
      expect(wrapper.text()).not.toContain('pages.admin.blaettchen.upload.prefilled')
    })

    it('forgets the file when the picker is cancelled', async () => {
      const wrapper = await mountLoaded()
      await choose(wrapper, '13_2026-09-01.pdf')
      const input = wrapper.find('#blaettchen-file')
      Object.defineProperty(input.element, 'files', { value: [], configurable: true })
      await input.trigger('change')
      // Fields keep their values, but there is nothing left to upload.
      expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    })

    it('keeps what was typed when a second, unnamed file is picked', async () => {
      const wrapper = await mountLoaded()
      await fill(wrapper, '#blaettchen-number', '13')
      await choose(wrapper, 'Entwurf.pdf')
      expect(field(wrapper, '#blaettchen-number')).toBe('13')
    })
  })

  describe('the resulting file name', () => {
    it('shows what will be written before anything is sent', async () => {
      const wrapper = await mountLoaded()
      await fill(wrapper, '#blaettchen-number', '13')
      await fill(wrapper, '#blaettchen-date', '2026-09-01')
      await fill(wrapper, '#blaettchen-title', 'Herbstausgabe')
      expect(wrapper.find('code').text()).toBe('13_2026-09-01_Herbstausgabe.pdf')
    })

    it('stays silent and blocks the upload while the fields are incomplete', async () => {
      const wrapper = await mountLoaded()
      await choose(wrapper, 'Entwurf.pdf')
      expect(wrapper.find('code').exists()).toBe(false)
      expect(wrapper.text()).toContain('pages.admin.blaettchen.upload.target-incomplete')
      expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    })

    it('blocks the upload while no file is picked', async () => {
      const wrapper = await mountLoaded()
      await fill(wrapper, '#blaettchen-number', '13')
      await fill(wrapper, '#blaettchen-date', '2026-09-01')
      expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    })

    it('blocks a subtitle with a path separator in it', async () => {
      // It would produce a name the listing could never read back.
      const wrapper = await mountLoaded()
      await choose(wrapper, 'Entwurf.pdf')
      await fill(wrapper, '#blaettchen-number', '13')
      await fill(wrapper, '#blaettchen-date', '2026-09-01')
      await fill(wrapper, '#blaettchen-title', 'Teil 1/2')
      expect(wrapper.find('code').exists()).toBe(false)
      expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    })

    it('blocks an impossible date rather than sending it', async () => {
      const wrapper = await mountLoaded()
      await choose(wrapper, 'Entwurf.pdf')
      await fill(wrapper, '#blaettchen-number', '13')
      await fill(wrapper, '#blaettchen-date', '2026-02-30')
      expect(wrapper.find('code').exists()).toBe(false)
      expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    })
  })

  describe('uploading', () => {
    async function readyToUpload(): Promise<VueWrapper> {
      const wrapper = await mountLoaded()
      await choose(wrapper, '13_2026-09-01.pdf')
      return wrapper
    }

    it('sends nothing when the form is submitted without a file', async () => {
      // The button is disabled, but Enter in a text field submits anyway.
      const wrapper = await mountLoaded()
      await wrapper.find('form').trigger('submit')
      expect(mock$fetch).not.toHaveBeenCalledWith('/api/admin/blaettchen/upload', expect.anything())
    })

    it('falls back to the generic message when there is no status at all', async () => {
      // A dropped connection has no status code to map.
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mock$fetch.mockImplementation((url: string) => {
        if (url === '/api/admin/blaettchen/upload') return Promise.reject(new Error('offline'))
        return fetchDefaults()(url)
      })
      const wrapper = await readyToUpload()
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => {
        expect(wrapper.text()).toContain('pages.admin.blaettchen.upload.error.failed')
      })
      consoleSpy.mockRestore()
    })

    it('sends the file with the fields the server names it from', async () => {
      mock$fetch.mockImplementation((url: string) => {
        if (url === '/api/admin/blaettchen/upload') {
          return Promise.resolve({
            issue: { number: 13, date: '2026-09-01', file: '13_2026-09-01.pdf' },
            replaced: [],
          })
        }
        return fetchDefaults()(url)
      })
      const wrapper = await readyToUpload()
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => {
        expect(mock$fetch).toHaveBeenCalledWith(
          '/api/admin/blaettchen/upload',
          expect.objectContaining({ method: 'POST' }),
        )
      })
      const form = uploadedForm()
      expect(form.get('number')).toBe('13')
      expect(form.get('date')).toBe('2026-09-01')
      expect(form.get('replace')).toBe('false')
      expect(form.get('file')).toBeInstanceOf(File)
    })

    it('sends the subtitle when there is one', async () => {
      mock$fetch.mockImplementation((url: string) => {
        if (url === '/api/admin/blaettchen/upload') {
          return Promise.resolve({
            issue: {
              number: 14,
              date: '2026-11-11',
              title: 'Sonderausgabe Herbst',
              file: '14_2026-11-11_Sonderausgabe Herbst.pdf',
            },
            replaced: [],
          })
        }
        return fetchDefaults()(url)
      })
      const wrapper = await mountLoaded()
      await choose(wrapper, '14_2026-11-11_Sonderausgabe Herbst.pdf')
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => {
        expect(mock$fetch).toHaveBeenCalledWith('/api/admin/blaettchen/upload', expect.anything())
      })
      expect(uploadedForm().get('title')).toBe('Sonderausgabe Herbst')
    })

    it('reports success, clears the form and reloads the list', async () => {
      mock$fetch.mockImplementation((url: string) => {
        if (url === '/api/admin/blaettchen/upload') {
          return Promise.resolve({
            issue: { number: 13, date: '2026-09-01', file: '13_2026-09-01.pdf' },
            replaced: [],
          })
        }
        return fetchDefaults()(url)
      })
      const wrapper = await readyToUpload()
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => {
        expect(wrapper.text()).toContain('pages.admin.blaettchen.upload.success')
      })
      // A cleared form is what stops the same issue being uploaded twice.
      expect(field(wrapper, '#blaettchen-number')).toBe('')
      expect(field(wrapper, '#blaettchen-date')).toBe('')
      // Reloaded, so the rail entry appears with the very first issue.
      expect(mock$fetch.mock.calls.filter(([url]) => url === '/api/blaettchen')).toHaveLength(2)
    })

    it.each([
      [409, 'exists'],
      [413, 'too-large'],
      [415, 'not-pdf'],
      [400, 'invalid'],
      [500, 'failed'],
    ])('turns a %i into its own message (%s)', async (statusCode, key) => {
      // "Upload fehlgeschlagen" for a file that is 11 MB tells the editor
      // nothing they can act on.
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mock$fetch.mockImplementation((url: string) => {
        if (url === '/api/admin/blaettchen/upload') {
          return Promise.reject(Object.assign(new Error('refused'), { statusCode }))
        }
        return fetchDefaults()(url)
      })
      const wrapper = await readyToUpload()
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => {
        expect(wrapper.text()).toContain(`pages.admin.blaettchen.upload.error.${key}`)
      })
      consoleSpy.mockRestore()
    })
  })

  describe('an issue number that is already taken', () => {
    it('warns and offers the replace flag only then', async () => {
      const wrapper = await mountLoaded()
      expect(wrapper.find('#blaettchen-replace').exists()).toBe(false)

      await choose(wrapper, '12_2026-06-01.pdf')
      expect(wrapper.text()).toContain('pages.admin.blaettchen.upload.clash')
      expect(wrapper.find('#blaettchen-replace').exists()).toBe(true)
    })

    it('sends the flag only when it was actually ticked', async () => {
      mock$fetch.mockImplementation((url: string) => {
        if (url === '/api/admin/blaettchen/upload') {
          return Promise.resolve({
            issue: { number: 12, date: '2026-06-01', file: '12_2026-06-01.pdf' },
            replaced: ['12_2026-05-01.pdf'],
          })
        }
        return fetchDefaults()(url)
      })
      const wrapper = await mountLoaded()
      await choose(wrapper, '12_2026-06-01.pdf')
      await wrapper.find('#blaettchen-replace').setValue(true)
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => {
        expect(mock$fetch).toHaveBeenCalledWith('/api/admin/blaettchen/upload', expect.anything())
      })
      expect(uploadedForm().get('replace')).toBe('true')
    })
  })

  describe('the existing issues', () => {
    it('lists them with their file names, newest first', async () => {
      const wrapper = await mountLoaded()
      const rows = wrapper.findAll('li')
      expect(rows).toHaveLength(2)
      expect(rows[0]!.text()).toContain('12_2026-05-01.pdf')
      expect(rows[1]!.text()).toContain('04_2023-12-23_Sonderausgabe Weihnachten.pdf')
    })

    it('links each issue to its PDF', async () => {
      const wrapper = await mountLoaded()
      expect(wrapper.find('li a').attributes('href')).toBe('/api/blaettchen/12_2026-05-01.pdf')
    })

    it('asks again before deleting — there is no second copy', async () => {
      const wrapper = await mountLoaded()
      await wrapper.findAll('li')[0]!.findAll('button')[0]!.trigger('click')
      expect(wrapper.text()).toContain('pages.admin.blaettchen.list.delete-confirm')
      expect(mock$fetch).not.toHaveBeenCalledWith('/api/admin/blaettchen/delete', expect.anything())
    })

    it('deletes only after the second click, and reloads', async () => {
      const wrapper = await mountLoaded()
      const row = () => wrapper.findAll('li')[0]!
      await row().findAll('button')[0]!.trigger('click')
      await row().findAll('button')[0]!.trigger('click')
      await vi.waitFor(() => {
        expect(mock$fetch).toHaveBeenCalledWith('/api/admin/blaettchen/delete', {
          method: 'POST',
          body: { file: '12_2026-05-01.pdf' },
        })
      })
      expect(mock$fetch.mock.calls.filter(([url]) => url === '/api/blaettchen')).toHaveLength(2)
    })

    it('lets the editor back out of a delete', async () => {
      const wrapper = await mountLoaded()
      const row = () => wrapper.findAll('li')[0]!
      await row().findAll('button')[0]!.trigger('click')
      await row().findAll('button')[1]!.trigger('click')
      expect(wrapper.text()).not.toContain('pages.admin.blaettchen.list.delete-confirm')
      expect(mock$fetch).not.toHaveBeenCalledWith('/api/admin/blaettchen/delete', expect.anything())
    })

    it('says so when the delete fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mock$fetch.mockImplementation((url: string) => {
        if (url === '/api/admin/blaettchen/delete') return Promise.reject(new Error('boom'))
        return fetchDefaults()(url)
      })
      const wrapper = await mountLoaded()
      const row = () => wrapper.findAll('li')[0]!
      await row().findAll('button')[0]!.trigger('click')
      await row().findAll('button')[0]!.trigger('click')
      await vi.waitFor(() => {
        expect(wrapper.text()).toContain('pages.admin.blaettchen.list.delete-error')
      })
      consoleSpy.mockRestore()
    })

    it('shows the empty state before the first issue exists', async () => {
      mock$fetch.mockImplementation((url: string) =>
        Promise.resolve(url === '/api/blaettchen' ? { issues: [], contact: null } : {}),
      )
      const wrapper = await mountSuspended(Page, { route: '/admin/blaettchen' })
      await vi.waitFor(() => {
        expect(wrapper.text()).toContain('pages.admin.blaettchen.list.empty')
      })
    })

    it('says so when the list cannot be loaded', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mock$fetch.mockImplementation((url: string) => {
        if (url === '/api/blaettchen') return Promise.reject(new Error('boom'))
        return Promise.resolve({})
      })
      const wrapper = await mountSuspended(Page, { route: '/admin/blaettchen' })
      await vi.waitFor(() => {
        expect(wrapper.text()).toContain('pages.admin.blaettchen.list.error')
      })
      consoleSpy.mockRestore()
    })
  })
})
