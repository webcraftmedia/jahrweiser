import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { stubApi } from '../../../test/helpers/stub-api'

import Page from './feedback.vue'

const mock$fetch = vi.fn()
stubApi(mock$fetch)

const mockIsDark = vi.hoisted(() => ({ value: false }))
mockNuxtImport('useColorMode', () => () => ({
  isDark: computed(() => mockIsDark.value),
  toggle: vi.fn(),
}))

mockNuxtImport('useUserSession', () => () => ({
  ready: computed(() => true),
  loggedIn: computed(() => true),
  user: computed(() => ({ name: 'Anna Mustermann', email: 'anna@example.com' })),
  session: ref(null),
  fetch: vi.fn(),
  openInPopup: vi.fn(),
  clear: vi.fn(),
}))

/**
 * Put a previous page into the history entry, the way vue-router does on every
 * navigation. `null` is the fresh-tab case jsdom starts out in.
 */
function cameFrom(path: string | null) {
  window.history.replaceState(path === null ? null : { back: path }, '')
}

interface ServeOptions {
  /** What GET /api/feedback answers — or `'fail'` for a broken check. */
  enabled?: boolean | 'fail'
  /** What POST /api/feedback answers; a number rejects with that status. */
  send?: 'ok' | number | 'error'
}

function serving({ enabled = true, send = 'ok' }: ServeOptions = {}) {
  mock$fetch.mockImplementation((url: string, opts?: { method?: string }) => {
    if (opts?.method === 'POST') {
      if (send === 'ok') return Promise.resolve({ sent: true })
      if (send === 'error') return Promise.reject(new Error('offline'))
      return Promise.reject(Object.assign(new Error('nope'), { statusCode: send }))
    }
    if (enabled === 'fail') return Promise.reject(new Error('500'))
    return Promise.resolve({ enabled })
  })
}

/** Mount and wait for the availability check to have landed. */
async function mountReady(route = '/projekt/feedback') {
  const wrapper = await mountSuspended(Page, { route })
  await vi.waitFor(() => {
    expect(wrapper.text()).not.toContain('pages.projekt.feedback.loading')
  })
  return wrapper
}

/** Switch the form over to a bug report. */
async function chooseBug(wrapper: Awaited<ReturnType<typeof mountReady>>) {
  await wrapper.find('input[type="radio"][value="bug"]').setValue()
}

/** Switch the form over to suggesting an event. */
async function chooseEvent(wrapper: Awaited<ReturnType<typeof mountReady>>) {
  await wrapper.find('input[type="radio"][value="event"]').setValue()
}

/** The value a field currently holds. */
function valueOf(wrapper: Awaited<ReturnType<typeof mountReady>>, selector: string): string {
  return (wrapper.find(selector).element as HTMLInputElement).value
}

/** Fill in a message and press send, then let the request settle. */
async function submitReport(
  wrapper: Awaited<ReturnType<typeof mountReady>>,
  message = 'Da fehlt was.',
) {
  await wrapper.find('#feedback-message').setValue(message)
  await wrapper.find('form').trigger('submit')
  await vi.waitFor(() => {
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
  })
}

/** The body of the last POST. */
function lastPost(): Record<string, unknown> {
  const call = mock$fetch.mock.calls.findLast(
    (c) => (c[1] as { method?: string } | undefined)?.method === 'POST',
  )!
  return (call[1] as { body: Record<string, unknown> }).body
}

describe('Page: Feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDark.value = false
    cameFrom(null)
    serving()
  })

  it('says it is loading while the availability check is in flight', async () => {
    mock$fetch.mockImplementation(() => new Promise(() => {}))
    const wrapper = await mountSuspended(Page, { route: '/projekt/feedback' })
    expect(wrapper.text()).toContain('pages.projekt.feedback.loading')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('offers the form once feedback is available', async () => {
    const wrapper = await mountReady()
    expect(wrapper.find('form').exists()).toBe(true)
    expect(mock$fetch).toHaveBeenCalledWith('/api/feedback')
  })

  it('explains itself instead of a form when no address is configured', async () => {
    serving({ enabled: false })
    const wrapper = await mountReady()
    expect(wrapper.text()).toContain('pages.projekt.feedback.unavailable')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('still offers the form when the check itself fails', async () => {
    // A blip must not swallow a report somebody sat down to write; the send
    // below names the real problem if there is one.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    serving({ enabled: 'fail' })
    const wrapper = await mountReady()
    expect(wrapper.find('form').exists()).toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('cannot be submitted while the message is empty', async () => {
    const wrapper = await mountReady()
    const button = wrapper.find('button[type="submit"]')
    expect(button.attributes('disabled')).toBeDefined()
    await wrapper.find('#feedback-message').setValue('   ')
    expect(button.attributes('disabled')).toBeDefined()
    await wrapper.find('#feedback-message').setValue('Ein Satz.')
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('sends plain feedback as message only — no technical context', async () => {
    cameFrom('/2026/09')
    const wrapper = await mountReady()
    await submitReport(wrapper, 'Gefällt mir gut.')
    expect(lastPost()).toStrictEqual({ kind: 'feedback', message: 'Gefällt mir gut.' })
    expect(wrapper.text()).toContain('pages.projekt.feedback.sent')
    // Emptied, so a second thought is a new report and not a resend.
    expect((wrapper.find('#feedback-message').element as HTMLTextAreaElement).value).toBe('')
  })

  it('sends a bug report with the context that makes it reproducible', async () => {
    cameFrom('/2026/09')
    const wrapper = await mountReady()
    await chooseBug(wrapper)
    await submitReport(wrapper, 'Die Karte lädt nicht.')
    expect(lastPost()).toStrictEqual({
      kind: 'bug',
      message: 'Die Karte lädt nicht.',
      context: {
        page: '/2026/09',
        appVersion: '0.0.0-test',
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}×${window.innerHeight}`,
        colorScheme: 'pages.projekt.feedback.context.light',
      },
    })
  })

  it('reports the colour scheme the member is actually using', async () => {
    mockIsDark.value = true
    const wrapper = await mountReady()
    await chooseBug(wrapper)
    await submitReport(wrapper)
    expect((lastPost().context as { colorScheme: string }).colorScheme).toBe(
      'pages.projekt.feedback.context.dark',
    )
  })

  it('takes the page from the history rather than asking for it', async () => {
    const wrapper = await mountReady()
    // Nothing for the member to fill in — the previous page is known.
    expect(wrapper.find('#feedback-page').exists()).toBe(false)
    await chooseBug(wrapper)
    await submitReport(wrapper)
    expect((lastPost().context as { page: string }).page).toBe('')
  })

  it('shows every value a bug report will send along', async () => {
    cameFrom('/karte')
    const wrapper = await mountReady()
    await chooseBug(wrapper)
    const details = wrapper.find('details').text()
    expect(details).toContain('Anna Mustermann')
    expect(details).toContain('anna@example.com')
    expect(details).toContain('/karte')
    expect(details).toContain('0.0.0-test')
    expect(details).toContain(navigator.userAgent)
    expect(details).toContain(`${window.innerWidth}×${window.innerHeight}`)
  })

  it('offers no such list for plain feedback, because there is nothing in it', async () => {
    const wrapper = await mountReady()
    expect(wrapper.find('details').exists()).toBe(false)
  })

  it('names the unknown page rather than showing a gap', async () => {
    const wrapper = await mountReady()
    await chooseBug(wrapper)
    expect(wrapper.find('details').text()).toContain('pages.projekt.feedback.context.none')
  })

  describe('suggesting an event', () => {
    /** Fill in the minimum a suggestion needs. */
    async function fillEvent(
      wrapper: Awaited<ReturnType<typeof mountReady>>,
      { title = 'Chorprobe', start = '2026-11-05T19:00', end = '2026-11-05T21:00' } = {},
    ) {
      await wrapper.find('#feedback-event-title').setValue(title)
      await wrapper.find('#feedback-event-start').setValue(start)
      await wrapper.find('#feedback-event-end').setValue(end)
    }

    it('offers the event fields only for a suggestion', async () => {
      const wrapper = await mountReady()
      expect(wrapper.find('#feedback-event-title').exists()).toBe(false)
      await chooseEvent(wrapper)
      for (const field of ['title', 'start', 'end', 'location']) {
        expect(wrapper.find(`#feedback-event-${field}`).exists()).toBe(true)
      }
      // A suggestion is not reproduced, so it carries no browser context either.
      expect(wrapper.find('details').exists()).toBe(false)
    })

    it('arrives ready to fill in when the calendar sent a date along', async () => {
      // This is the calendar's "+": kind preselected, the displayed month in,
      // and an end two hours later so only the title is actually missing.
      const wrapper = await mountReady('/projekt/feedback?kind=event&date=2026-11-01')
      expect(wrapper.find('#feedback-event-title').exists()).toBe(true)
      expect(valueOf(wrapper, '#feedback-event-start')).toBe('2026-11-01T19:00')
      expect(valueOf(wrapper, '#feedback-event-end')).toBe('2026-11-01T21:00')
      expect(wrapper.text()).toContain('pages.projekt.feedback.heading-event')
    })

    it('ignores a date the query made up', async () => {
      const wrapper = await mountReady('/projekt/feedback?kind=event&date=irgendwann')
      expect(valueOf(wrapper, '#feedback-event-start')).toBe('')
      expect(valueOf(wrapper, '#feedback-event-end')).toBe('')
    })

    it('needs a title and a time, not a description', async () => {
      const wrapper = await mountReady()
      await chooseEvent(wrapper)
      const button = wrapper.find('button[type="submit"]')
      expect(button.attributes('disabled')).toBeDefined()
      await wrapper.find('#feedback-event-title').setValue('Chorprobe')
      // Named, but no time yet.
      expect(button.attributes('disabled')).toBeDefined()
      await wrapper.find('#feedback-event-start').setValue('2026-11-05T19:00')
      // The end came along with the start, so this is complete — without a word
      // of description.
      expect(button.attributes('disabled')).toBeUndefined()
    })

    it('refuses a title of nothing but spaces', async () => {
      const wrapper = await mountReady()
      await chooseEvent(wrapper)
      await fillEvent(wrapper, { title: '   ' })
      expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    })

    it('drags an untouched end along when the start moves', async () => {
      const wrapper = await mountReady()
      await chooseEvent(wrapper)
      await wrapper.find('#feedback-event-start').setValue('2026-11-05T19:00')
      expect(valueOf(wrapper, '#feedback-event-end')).toBe('2026-11-05T21:00')
      await wrapper.find('#feedback-event-start').setValue('2026-11-06T23:30')
      // Rolled into the next day rather than ending before it started.
      expect(valueOf(wrapper, '#feedback-event-end')).toBe('2026-11-07T01:30')
    })

    it('leaves an end that was chosen on purpose alone', async () => {
      const wrapper = await mountReady()
      await chooseEvent(wrapper)
      await wrapper.find('#feedback-event-start').setValue('2026-11-05T10:00')
      await wrapper.find('#feedback-event-end').setValue('2026-11-05T18:00')
      await wrapper.find('#feedback-event-start').setValue('2026-11-05T11:00')
      expect(valueOf(wrapper, '#feedback-event-end')).toBe('2026-11-05T18:00')
    })

    it('says so and refuses to send when the end is before the start', async () => {
      const wrapper = await mountReady()
      await chooseEvent(wrapper)
      await fillEvent(wrapper, { start: '2026-11-05T19:00', end: '2026-11-05T21:00' })
      await wrapper.find('#feedback-event-end').setValue('2026-11-04T09:00')
      expect(wrapper.text()).toContain('pages.projekt.feedback.event.end-before-start')
      expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    })

    it('sends the suggestion as structured fields, description and all', async () => {
      const wrapper = await mountReady()
      await chooseEvent(wrapper)
      await fillEvent(wrapper)
      await wrapper.find('#feedback-event-location').setValue('Gemeindehaus')
      await submitReport(wrapper, 'Bitte Noten mitbringen.')
      expect(lastPost()).toStrictEqual({
        kind: 'event',
        message: 'Bitte Noten mitbringen.',
        event: {
          title: 'Chorprobe',
          start: '2026-11-05T19:00',
          end: '2026-11-05T21:00',
          location: 'Gemeindehaus',
        },
      })
      expect(wrapper.text()).toContain('pages.projekt.feedback.sent-event')
    })

    it('sends a suggestion without a description or a place', async () => {
      const wrapper = await mountReady()
      await chooseEvent(wrapper)
      await fillEvent(wrapper)
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => {
        expect(wrapper.find('[role="status"]').exists()).toBe(true)
      })
      expect(lastPost()).toMatchObject({ kind: 'event', message: '' })
      expect((lastPost().event as { location: string }).location).toBe('')
    })

    it('empties the fields once it is out', async () => {
      const wrapper = await mountReady()
      await chooseEvent(wrapper)
      await fillEvent(wrapper)
      await wrapper.find('#feedback-event-location').setValue('Gemeindehaus')
      await submitReport(wrapper, 'Bitte Noten mitbringen.')
      for (const field of ['title', 'start', 'end', 'location']) {
        expect(valueOf(wrapper, `#feedback-event-${field}`)).toBe('')
      }
    })

    it('keeps the suggestion when the send fails', async () => {
      serving({ send: 500 })
      const wrapper = await mountReady()
      await chooseEvent(wrapper)
      await fillEvent(wrapper)
      await submitReport(wrapper, 'Mühsam getippt.')
      expect(valueOf(wrapper, '#feedback-event-title')).toBe('Chorprobe')
      expect(valueOf(wrapper, '#feedback-event-start')).toBe('2026-11-05T19:00')
    })
  })

  describe('when sending fails', () => {
    it('explains the cooldown on 429', async () => {
      serving({ send: 429 })
      const wrapper = await mountReady()
      await submitReport(wrapper)
      expect(wrapper.text()).toContain('pages.projekt.feedback.error-cooldown')
    })

    it('says so when the server has no address on 503', async () => {
      serving({ send: 503 })
      const wrapper = await mountReady()
      await submitReport(wrapper)
      expect(wrapper.text()).toContain('pages.projekt.feedback.error-unavailable')
    })

    it('falls back to a general error otherwise', async () => {
      serving({ send: 'error' })
      const wrapper = await mountReady()
      await submitReport(wrapper)
      expect(wrapper.text()).toContain('pages.projekt.feedback.error')
    })

    it('keeps the message so it can be sent again', async () => {
      serving({ send: 500 })
      const wrapper = await mountReady()
      await submitReport(wrapper, 'Mühsam getippt.')
      expect((wrapper.find('#feedback-message').element as HTMLTextAreaElement).value).toBe(
        'Mühsam getippt.',
      )
      expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
    })
  })
})
