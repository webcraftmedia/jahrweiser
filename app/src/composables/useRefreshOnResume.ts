/**
 * How long the app has to have been out of sight before coming back refetches
 * what it shows.
 *
 * The case this exists for is the phone: a tab or the installed PWA is left
 * open for days, and returning to it shows the calendar as it was then — with
 * no reload button in the PWA and no pull-to-refresh to fix that by hand. Five
 * minutes is long enough that flicking to another app and back (copying an
 * address, answering a message) costs no request at all, and short enough that
 * nobody returns to an afternoon-old list.
 */
export const RESUME_REFRESH_AFTER_MS = 5 * 60 * 1000

/**
 * Calls `refresh` when the member comes back to the app after it has been out
 * of sight for at least `RESUME_REFRESH_AFTER_MS`.
 *
 * Coming back means either of two events, because browsers report it either
 * way: `visibilitychange` to visible for a tab or app switch, and `pageshow`
 * with `persisted` for a page restored from the back/forward cache, which may
 * never have reported itself as hidden in the first place — hence `pagehide`
 * counts as leaving, too. The clock is the wall clock on purpose: a phone that
 * slept for a night has to count that night, which a monotonic clock that
 * stops with the CPU would not.
 *
 * `refresh` is meant to *refetch read data* and nothing else — it runs on
 * whatever page is open, so it must leave form input alone and should keep
 * showing what it has until the new answer is there. A 401 on the way needs no
 * handling here: the request goes through `useApi()`, and an expired session
 * ends in the login redirect exactly as it does on any other request.
 *
 * At most one refresh runs at a time: the two events above often fire
 * together, and a refresh that is still waiting for a slow network is not
 * helped by a second one behind it.
 *
 * Listeners are attached on mount and removed on unmount, so only the
 * components that are actually on screen refresh.
 */
export function useRefreshOnResume(refresh: () => void | Promise<void>): void {
  /** When the app was last seen leaving; null while it is on screen. */
  let hiddenSince: number | null = null
  let running = false

  function leave(): void {
    // Keep the earlier mark: `pagehide` after `visibilitychange` must not
    // restart the clock.
    hiddenSince ??= Date.now()
  }

  async function resume(): Promise<void> {
    const since = hiddenSince
    hiddenSince = null
    if (since === null || Date.now() - since < RESUME_REFRESH_AFTER_MS || running) return
    running = true
    try {
      await refresh()
    } finally {
      running = false
    }
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') leave()
    else void resume()
  }

  function onPageShow(event: PageTransitionEvent): void {
    if (event.persisted) void resume()
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', leave)
    window.addEventListener('pageshow', onPageShow)
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', leave)
    window.removeEventListener('pageshow', onPageShow)
  })
}
