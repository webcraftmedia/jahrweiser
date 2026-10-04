import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { stubApi } from '../../test/helpers/stub-api'

import Component from './LoginCodeForm.vue'

const { mockNavigateTo, mock$fetch, mockRefreshSession } = vi.hoisted(() => ({
  mockNavigateTo: vi.fn(),
  mock$fetch: vi.fn(),
  mockRefreshSession: vi.fn(),
}))
const mockLoggedIn = ref(false)

mockNuxtImport('useUserSession', () => () => ({
  loggedIn: mockLoggedIn,
  fetch: mockRefreshSession,
}))
mockNuxtImport('navigateTo', () => mockNavigateTo)

stubApi(mock$fetch)

function refusal(data: Record<string, unknown>) {
  return Object.assign(new Error('401'), { data: { data } })
}

async function submit(props: Record<string, unknown> = {}, code = '123 456') {
  const wrapper = await mountSuspended(Component, { props })
  await wrapper.find('input').setValue(code)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  return wrapper
}

describe('LoginCodeForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoggedIn.value = false
    mock$fetch.mockResolvedValue({})
    mockRefreshSession.mockImplementation(async () => {
      mockLoggedIn.value = true
    })
  })

  it('lets the phone offer the code from the mail', async () => {
    const wrapper = await mountSuspended(Component)
    const input = wrapper.find('input')
    expect(input.attributes('autocomplete')).toBe('one-time-code')
    expect(input.attributes('inputmode')).toBe('numeric')
  })

  it('keeps the button disabled until six digits are in', async () => {
    const wrapper = await mountSuspended(Component)
    const button = wrapper.find('button')
    await wrapper.find('input').setValue('123 45')
    expect(button.attributes('disabled')).toBeDefined()
    await wrapper.find('form').trigger('submit')
    expect(mock$fetch).not.toHaveBeenCalled()
    await wrapper.find('input').setValue('123 456')
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('sends the digits without the grouping space and goes on to the redirect', async () => {
    await submit({ redirect: '/karte' })
    expect(mock$fetch).toHaveBeenCalledWith(
      '/api/redeemLoginCode',
      expect.objectContaining({ method: 'POST', body: { code: '123456' } }),
    )
    expect(mockNavigateTo).toHaveBeenCalledWith('/karte')
  })

  it('goes home without a redirect', async () => {
    await submit()
    expect(mockNavigateTo).toHaveBeenCalledWith('/')
  })

  it('says so when the browser dropped the session cookie', async () => {
    mockRefreshSession.mockResolvedValue(undefined)
    const wrapper = await submit()
    expect(mockNavigateTo).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('components.LoginCodeForm.error.nosession')
  })

  it.each([
    ['wrong', 'components.LoginCodeForm.error.wrong'],
    ['locked', 'components.LoginCodeForm.error.locked'],
    ['expired', 'components.LoginCodeForm.error.expired'],
    ['unknown', 'components.LoginCodeForm.error.elsewhere'],
    ['used', 'components.LoginCodeForm.error.used'],
    ['disabled', 'pages.login.error.disabled'],
    ['something-new', 'pages.login.error.text'],
  ])('explains the refusal %s', async (reason, key) => {
    mock$fetch.mockRejectedValue(refusal({ reason, attemptsLeft: 3 }))
    const wrapper = await submit()
    expect(wrapper.find('[role="alert"]').text()).toContain(key)
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
  })

  it('falls back to the generic sentence when the error carries no reason', async () => {
    mock$fetch.mockRejectedValue(new Error('network'))
    const wrapper = await submit()
    expect(wrapper.find('[role="alert"]').text()).toContain('pages.login.error.text')
  })

  it('handles a wrong code without a count', async () => {
    mock$fetch.mockRejectedValue(refusal({ reason: 'wrong' }))
    const wrapper = await submit()
    expect(wrapper.find('[role="alert"]').text()).toContain('components.LoginCodeForm.error.wrong')
  })

  it('clears the message as soon as the member types again', async () => {
    mock$fetch.mockRejectedValue(refusal({ reason: 'wrong', attemptsLeft: 1 }))
    const wrapper = await submit()
    await wrapper.find('input').setValue('1')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  describe('when the server does not answer', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      mock$fetch.mockImplementation(() => new Promise(() => {}))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('gives up and says so', async () => {
      const wrapper = await mountSuspended(Component)
      await wrapper.find('input').setValue('123456')
      await wrapper.find('form').trigger('submit')
      await vi.advanceTimersByTimeAsync(15_000)
      expect(wrapper.find('[role="alert"]').text()).toContain('pages.login.error.timeout')
      expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
    })
  })
})
