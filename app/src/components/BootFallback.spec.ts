import { mountSuspended, renderSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Component from './BootFallback.vue'

const { capturedHead } = vi.hoisted(() => ({
  capturedHead: [] as { script?: { innerHTML?: string }[] }[],
}))

mockNuxtImport('useHead', () => (input: { script?: { innerHTML?: string }[] }) => {
  capturedHead.push(input)
})

/**
 * Runs the watchdog as it is shipped, rather than a paraphrase of it.
 *
 * The Function constructor is the point: this script reaches the browser as
 * text inside a `<script>` tag, and a test that re-implemented its logic in
 * TypeScript would keep passing after the shipped string broke. The input is
 * our own component, not user data.
 */
function runWatchdog() {
  const script = capturedHead.at(-1)?.script?.[0]?.innerHTML
  expect(script, 'component must register a watchdog script').toBeTruthy()
  // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval -- see above
  new Function(script as string)()
}

describe('Component: BootFallback', () => {
  beforeEach(() => {
    capturedHead.length = 0
    delete (window as unknown as { __jwMounted?: boolean }).__jwMounted
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    for (const stale of document.querySelectorAll('#boot-fallback')) stale.remove()
  })

  it('renders hidden, so a working app never shows it', async () => {
    const html = await (await renderSuspended(Component)).html()
    expect(html).toContain('id="boot-fallback"')
    expect(html).toMatch(/id="boot-fallback"[^>]*\bhidden\b/)
  })

  it('carries a noscript copy, for the case where no script runs at all', async () => {
    const html = await (await renderSuspended(Component)).html()
    expect(html).toContain('<noscript>')
    expect(html).toContain('components.BootFallback.noscript')
  })

  it('marks the app as mounted, which is what the watchdog looks for', async () => {
    await mountSuspended(Component)
    expect((window as unknown as { __jwMounted?: boolean }).__jwMounted).toBe(true)
  })

  describe('the watchdog script', () => {
    /** A server-rendered page as the browser sees it before any app runs. */
    function renderServerSide() {
      const element = document.createElement('div')
      element.id = 'boot-fallback'
      element.setAttribute('hidden', '')
      document.body.append(element)
      return element
    }

    beforeEach(async () => {
      // Rendering is only how the script is obtained. It also mounts the
      // component, which sets the very flag under test and leaves a second
      // #boot-fallback in the DOM — so undo both before asserting anything.
      await renderSuspended(Component)
      for (const stale of document.querySelectorAll('#boot-fallback')) stale.remove()
      delete (window as unknown as { __jwMounted?: boolean }).__jwMounted
    })

    it('reveals the message when the app never mounted', () => {
      const element = renderServerSide()
      // readyState is 'complete' in jsdom, so the script arms its grace timer.
      runWatchdog()
      expect(element.hasAttribute('hidden')).toBe(true)

      vi.advanceTimersByTime(1500)
      expect(element.hasAttribute('hidden')).toBe(false)
    })

    it('stays quiet when the app did mount', () => {
      const element = renderServerSide()
      ;(window as unknown as { __jwMounted?: boolean }).__jwMounted = true

      runWatchdog()
      vi.advanceTimersByTime(30_000)
      expect(element.hasAttribute('hidden')).toBe(true)
    })

    it('still fires when the load event never arrives', () => {
      const element = renderServerSide()
      Object.defineProperty(document, 'readyState', {
        value: 'loading',
        configurable: true,
      })

      runWatchdog()
      vi.advanceTimersByTime(1500)
      // The grace timer is chained to `load`, which is not coming.
      expect(element.hasAttribute('hidden')).toBe(true)

      vi.advanceTimersByTime(20_000)
      expect(element.hasAttribute('hidden')).toBe(false)

      Object.defineProperty(document, 'readyState', {
        value: 'complete',
        configurable: true,
      })
    })

    it('does nothing when the element is absent', () => {
      expect(() => {
        runWatchdog()
        vi.advanceTimersByTime(30_000)
      }).not.toThrow()
    })
  })
})
