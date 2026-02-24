import { mountSuspended, renderSuspended } from '@nuxt/test-utils/runtime'
import Page from './add.vue'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mock$fetch = vi.fn()
vi.stubGlobal('$fetch', mock$fetch)

describe('Page: Add', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/admin/getUserTags') {
        return Promise.resolve([
          { name: 'Calendar A', state: false },
          { name: 'Calendar B', state: true },
        ])
      }
      if (url === '/api/admin/updateUserTags') {
        return Promise.resolve(true)
      }
      return Promise.resolve({})
    })
  })

  it('renders', async () => {
    const html = await (
      await renderSuspended(Page, {
        route: '/admin/members/add',
      })
    ).html()
    expect(html).toMatchSnapshot()
  })

  it('validates email', async () => {
    const wrapper = await mountSuspended(Page, { route: '/admin/members/add' })
    const nextButton = wrapper.find('button[type="button"]')
    // Button should be disabled with empty email
    expect(nextButton.attributes('disabled')).toBeDefined()

    // Enter valid email
    await wrapper.find('#email').setValue('test@example.com')
    expect(nextButton.attributes('disabled')).toBeUndefined()
  })

  it('progresses from step 1 to step 2', async () => {
    const wrapper = await mountSuspended(Page, { route: '/admin/members/add' })
    await wrapper.find('#email').setValue('test@example.com')
    await wrapper.find('button[type="button"]:not([disabled])').trigger('click')
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/admin/getUserTags', expect.objectContaining({
        method: 'POST',
        body: { email: 'test@example.com' },
      }))
    })
    // Tags should be rendered
    expect(wrapper.findAll('input[type="checkbox"]').length).toBeGreaterThanOrEqual(2)
  })

  it('progresses from step 2 to step 3', async () => {
    const wrapper = await mountSuspended(Page, { route: '/admin/members/add' })
    // Step 1: email
    await wrapper.find('#email').setValue('test@example.com')
    await wrapper.find('button[type="button"]:not([disabled])').trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.findAll('input[type="checkbox"]').length).toBeGreaterThanOrEqual(2)
    })
    // Step 2: confirm tags
    const step2Buttons = wrapper.findAll('button[type="button"]')
    const nextButton = step2Buttons.find((b) => b.text().includes('step2.button-next'))
    await nextButton!.trigger('click')
    // Step 3: welcome email checkbox should be visible
    expect(wrapper.find('#welcome-email').exists()).toBe(true)
  })

  it('submits form with success-with-email result', async () => {
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/admin/getUserTags') return Promise.resolve([{ name: 'Cal', state: true }])
      if (url === '/api/admin/updateUserTags') return Promise.resolve(true)
      return Promise.resolve({})
    })
    const wrapper = await mountSuspended(Page, { route: '/admin/members/add' })
    // Step 1
    await wrapper.find('#email').setValue('test@example.com')
    await wrapper.find('button[type="button"]:not([disabled])').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('#tag-0').exists()).toBe(true))
    // Step 2
    const step2Button = wrapper.findAll('button[type="button"]').find((b) => b.text().includes('step2.button-next'))
    await step2Button!.trigger('click')
    // Step 3 - submit
    const submitButton = wrapper.findAll('button[type="button"]').find((b) => b.text().includes('step3.button-submit'))
    await submitButton!.trigger('click')
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/admin/updateUserTags', expect.objectContaining({
        method: 'POST',
      }))
    })
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('result.success-with-email')
    })
  })

  it('submits form with success-without-email result', async () => {
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/admin/getUserTags') return Promise.resolve([])
      if (url === '/api/admin/updateUserTags') return Promise.resolve(false)
      return Promise.resolve({})
    })
    const wrapper = await mountSuspended(Page, { route: '/admin/members/add' })
    await wrapper.find('#email').setValue('user@example.com')
    await wrapper.find('button[type="button"]:not([disabled])').trigger('click')
    await vi.waitFor(() => {
      const btns = wrapper.findAll('button[type="button"]')
      return btns.some((b) => b.text().includes('step2.button-next'))
    })
    const step2Button = wrapper.findAll('button[type="button"]').find((b) => b.text().includes('step2.button-next'))
    await step2Button!.trigger('click')
    const submitButton = wrapper.findAll('button[type="button"]').find((b) => b.text().includes('step3.button-submit'))
    await submitButton!.trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('result.success-without-email')
    })
  })

  it('shows error on submit failure', async () => {
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/admin/getUserTags') return Promise.resolve([])
      if (url === '/api/admin/updateUserTags') return Promise.reject(new Error('Server error'))
      return Promise.resolve({})
    })
    const wrapper = await mountSuspended(Page, { route: '/admin/members/add' })
    await wrapper.find('#email').setValue('user@example.com')
    await wrapper.find('button[type="button"]:not([disabled])').trigger('click')
    await vi.waitFor(() => {
      const btns = wrapper.findAll('button[type="button"]')
      return btns.some((b) => b.text().includes('step2.button-next'))
    })
    const step2Button = wrapper.findAll('button[type="button"]').find((b) => b.text().includes('step2.button-next'))
    await step2Button!.trigger('click')
    const submitButton = wrapper.findAll('button[type="button"]').find((b) => b.text().includes('step3.button-submit'))
    await submitButton!.trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('result.error-title')
    })
  })

  it('resets form after submission', async () => {
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/admin/getUserTags') return Promise.resolve([])
      if (url === '/api/admin/updateUserTags') return Promise.resolve(true)
      return Promise.resolve({})
    })
    const wrapper = await mountSuspended(Page, { route: '/admin/members/add' })
    await wrapper.find('#email').setValue('user@example.com')
    await wrapper.find('button[type="button"]:not([disabled])').trigger('click')
    await vi.waitFor(() => {
      const btns = wrapper.findAll('button[type="button"]')
      return btns.some((b) => b.text().includes('step2.button-next'))
    })
    const step2Button = wrapper.findAll('button[type="button"]').find((b) => b.text().includes('step2.button-next'))
    await step2Button!.trigger('click')
    const submitButton = wrapper.findAll('button[type="button"]').find((b) => b.text().includes('step3.button-submit'))
    await submitButton!.trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('result.button-new')
    })
    // Click "new" button to reset
    const resetButton = wrapper.findAll('button[type="button"]').find((b) => b.text().includes('result.button-new'))
    await resetButton!.trigger('click')
    // Should be back at step 1
    expect((wrapper.find('#email').element as HTMLInputElement).value).toBe('')
  })

  it('goes back to step 1 from step 2', async () => {
    const wrapper = await mountSuspended(Page, { route: '/admin/members/add' })
    await wrapper.find('#email').setValue('test@example.com')
    await wrapper.find('button[type="button"]:not([disabled])').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('#tag-0').exists()).toBe(true))
    // Click edit button to go back to step 1
    const editButton = wrapper.findAll('button[type="button"]').find((b) => b.text().includes('step1.button-edit'))
    await editButton!.trigger('click')
    // Email input should be enabled again
    expect(wrapper.find('#email').attributes('disabled')).toBeUndefined()
  })

  it('goes back to step 2 from step 3', async () => {
    const wrapper = await mountSuspended(Page, { route: '/admin/members/add' })
    await wrapper.find('#email').setValue('test@example.com')
    await wrapper.find('button[type="button"]:not([disabled])').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('#tag-0').exists()).toBe(true))
    const step2Button = wrapper.findAll('button[type="button"]').find((b) => b.text().includes('step2.button-next'))
    await step2Button!.trigger('click')
    expect(wrapper.find('#welcome-email').exists()).toBe(true)
    // Click edit button for step 2
    const editButton = wrapper.findAll('button[type="button"]').find((b) => b.text().includes('step1.button-edit'))
    // There should be two edit buttons - step1 and step2. The second one goes to step 2.
    const editButtons = wrapper.findAll('button[type="button"]').filter((b) => b.text().includes('step1.button-edit'))
    await editButtons[1]!.trigger('click')
    // Tag checkboxes should be enabled again
    expect(wrapper.find('#tag-0').attributes('disabled')).toBeUndefined()
  })

  it('shakes email input on Enter with invalid email', async () => {
    vi.useFakeTimers()
    const wrapper = await mountSuspended(Page, { route: '/admin/members/add' })
    await wrapper.find('#email').setValue('invalid')
    await wrapper.find('#email').trigger('keyup.enter')
    expect(wrapper.find('#email').classes()).toContain('shake')
    vi.advanceTimersByTime(600)
    await nextTick()
    expect(wrapper.find('#email').classes()).not.toContain('shake')
    vi.useRealTimers()
  })

  it('confirms email on Enter with valid email', async () => {
    const wrapper = await mountSuspended(Page, { route: '/admin/members/add' })
    await wrapper.find('#email').setValue('test@example.com')
    await wrapper.find('#email').trigger('keyup.enter')
    await vi.waitFor(() => {
      expect(mock$fetch).toHaveBeenCalledWith('/api/admin/getUserTags', expect.anything())
    })
  })

  it('handles getUserTags error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/admin/getUserTags') return Promise.reject(new Error('fetch error'))
      return Promise.resolve({})
    })
    const wrapper = await mountSuspended(Page, { route: '/admin/members/add' })
    await wrapper.find('#email').setValue('test@example.com')
    await wrapper.find('button[type="button"]:not([disabled])').trigger('click')
    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })
    consoleSpy.mockRestore()
  })

  it('toggles tag checkboxes', async () => {
    const wrapper = await mountSuspended(Page, { route: '/admin/members/add' })
    await wrapper.find('#email').setValue('test@example.com')
    await wrapper.find('button[type="button"]:not([disabled])').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('#tag-0').exists()).toBe(true))
    const checkbox = wrapper.find('#tag-0')
    const initialState = (checkbox.element as HTMLInputElement).checked
    await checkbox.setValue(!initialState)
    expect((checkbox.element as HTMLInputElement).checked).toBe(!initialState)
  })

  it('toggles sendMail checkbox', async () => {
    mock$fetch.mockImplementation((url: string) => {
      if (url === '/api/admin/getUserTags') return Promise.resolve([])
      return Promise.resolve({})
    })
    const wrapper = await mountSuspended(Page, { route: '/admin/members/add' })
    await wrapper.find('#email').setValue('test@example.com')
    await wrapper.find('button[type="button"]:not([disabled])').trigger('click')
    await vi.waitFor(() => {
      const btns = wrapper.findAll('button[type="button"]')
      return btns.some((b) => b.text().includes('step2.button-next'))
    })
    const step2Button = wrapper.findAll('button[type="button"]').find((b) => b.text().includes('step2.button-next'))
    await step2Button!.trigger('click')
    const checkbox = wrapper.find('#welcome-email')
    expect((checkbox.element as HTMLInputElement).checked).toBe(true)
    await checkbox.setValue(false)
    expect((checkbox.element as HTMLInputElement).checked).toBe(false)
  })
})
