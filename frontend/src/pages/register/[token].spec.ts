import { mountSuspended, renderSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import Page from './[token].vue'

const { mockNavigateTo, mock$fetch } = vi.hoisted(() => ({
  mockNavigateTo: vi.fn(),
  mock$fetch: vi.fn(),
}))
const mockLoggedIn = ref(false)

mockNuxtImport('useUserSession', () => () => ({
  ready: computed(() => true),
  loggedIn: mockLoggedIn,
  user: computed(() => null),
  session: ref(null),
  fetch: vi.fn(),
  openInPopup: vi.fn(),
  clear: vi.fn(),
}))
mockNuxtImport('navigateTo', () => mockNavigateTo)

vi.stubGlobal('$fetch', mock$fetch)

const ROUTE = '/register/tok-1'

function defaultFetch(validateStatus = 'valid', postStatus = 'created') {
  return (url: string, opts?: { method?: string }) => {
    if (url.startsWith('/api/register/')) return Promise.resolve({ status: validateStatus })
    if (url === '/api/register' && opts?.method === 'POST') {
      return Promise.resolve({ status: postStatus })
    }
    return Promise.resolve({})
  }
}

async function mountValid() {
  const wrapper = await mountSuspended(Page, { route: ROUTE })
  await vi.waitFor(() => {
    expect(wrapper.find('#email').exists()).toBe(true)
  })
  return wrapper
}

async function fillValid(wrapper: Awaited<ReturnType<typeof mountValid>>) {
  await wrapper.find('#firstName').setValue('Anna')
  await wrapper.find('#lastName').setValue('Mustermann')
  await wrapper.find('#email').setValue('anna@example.com')
}

describe('Page: Register Token', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoggedIn.value = false
    mock$fetch.mockImplementation(defaultFetch())
  })

  it('renders the form once the link validates', async () => {
    const wrapper = await mountValid()
    expect(wrapper.html()).toMatchSnapshot()
  })

  it('renders the validating state initially', async () => {
    // Keep validation pending so the loading state is the rendered output.
    mock$fetch.mockImplementation(() => new Promise(() => {}))
    const html = await (await renderSuspended(Page, { route: ROUTE })).html()
    expect(html).toContain('pages.register.validating')
  })

  it('redirects to home when already logged in', async () => {
    mockLoggedIn.value = true
    await mountSuspended(Page, { route: ROUTE })
    expect(mockNavigateTo).toHaveBeenCalledWith('/')
  })

  it('shows the invalid message when the link is not usable', async () => {
    mock$fetch.mockImplementation(defaultFetch('expired'))
    const wrapper = await mountSuspended(Page, { route: ROUTE })
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.register.invalid.expired')
    })
    expect(wrapper.find('#email').exists()).toBe(false)
  })

  it('treats a failed validation request as not found', async () => {
    mock$fetch.mockImplementation((url: string) => {
      if (url.startsWith('/api/register/')) return Promise.reject(new Error('boom'))
      return Promise.resolve({})
    })
    const wrapper = await mountSuspended(Page, { route: ROUTE })
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.register.invalid.notfound')
    })
  })

  it('submits the form and shows the confirmation', async () => {
    const wrapper = await mountValid()
    await fillValid(wrapper)
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith(
        '/api/register',
        expect.objectContaining({
          method: 'POST',
          body: {
            token: 'tok-1',
            email: 'anna@example.com',
            firstName: 'Anna',
            lastName: 'Mustermann',
          },
        }),
      )
    })
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.register.created.title')
    })
  })

  it('shows the already-registered message with a login link', async () => {
    mock$fetch.mockImplementation(defaultFetch('valid', 'already-registered'))
    const wrapper = await mountValid()
    await fillValid(wrapper)
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.register.exists.title')
    })
    expect(wrapper.find('a[href="/login"]').exists()).toBe(true)
  })

  it('shows an error when submitting fails', async () => {
    mock$fetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (url.startsWith('/api/register/')) return Promise.resolve({ status: 'valid' })
      if (url === '/api/register' && opts?.method === 'POST') {
        return Promise.reject(new Error('gone'))
      }
      return Promise.resolve({})
    })
    const wrapper = await mountValid()
    await fillValid(wrapper)
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.register.form.error')
    })
  })

  it('blocks submit and flags the email when it is invalid', async () => {
    const wrapper = await mountValid()
    await wrapper.find('#firstName').setValue('Anna')
    await wrapper.find('#lastName').setValue('Mustermann')
    await wrapper.find('#email').setValue('not-an-email')

    const submitButton = wrapper.find('button[type="submit"]')
    expect(submitButton.attributes('disabled')).toBeDefined()

    // Force the handler to run anyway via a native form submit.
    await wrapper.find('form').trigger('submit')
    expect(mock$fetch).not.toHaveBeenCalledWith('/api/register', expect.anything())
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.register.form.email.invalid')
    })
  })

  it('clears the email error on input', async () => {
    const wrapper = await mountValid()
    await wrapper.find('#firstName').setValue('Anna')
    await wrapper.find('#lastName').setValue('Mustermann')
    await wrapper.find('#email').setValue('bad')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.register.form.email.invalid')
    })
    await wrapper.find('#email').setValue('anna@example.com')
    expect(wrapper.text()).not.toContain('pages.register.form.email.invalid')
  })

  it('disables the button until all fields are valid', async () => {
    const wrapper = await mountValid()
    const button = () => wrapper.find('button[type="submit"]')
    expect(button().attributes('disabled')).toBeDefined()

    await wrapper.find('#firstName').setValue('Anna')
    expect(button().attributes('disabled')).toBeDefined()

    await wrapper.find('#lastName').setValue('Mustermann')
    expect(button().attributes('disabled')).toBeDefined()

    await wrapper.find('#email').setValue('anna@example.com')
    expect(button().attributes('disabled')).toBeUndefined()
  })

  it('shows the sending state while the request is in flight', async () => {
    let resolvePost!: (value: unknown) => void
    mock$fetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (url.startsWith('/api/register/')) return Promise.resolve({ status: 'valid' })
      if (url === '/api/register' && opts?.method === 'POST') {
        return new Promise((resolve) => {
          resolvePost = resolve
        })
      }
      return Promise.resolve({})
    })
    const wrapper = await mountValid()
    await fillValid(wrapper)
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.register.form.loading')
    })
    resolvePost({ status: 'created' })
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('pages.register.created.title')
    })
  })
})
