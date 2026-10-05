/**
 * Refreshing what the app shows — for the places where the browser gives the
 * member no way to: the installed app has no reload button and no
 * pull-to-refresh, and a phone tab left open for days shows the calendar as it
 * was then (docu/pwa.md).
 *
 * Components that show server data register a refresh function while they are
 * mounted (`useRefreshable`). Three things run all of them:
 *
 * - coming back to the app after it was out of sight for at least
 *   `RESUME_REFRESH_AFTER_MS`,
 * - the refresh button in the header (installed app only),
 * - pulling the calendar down at its top (installed app only).
 *
 * A refresh function is meant to *refetch read data* and nothing else — it runs
 * on whatever page is open, so it must leave form input alone and keep showing
 * what it has until the new answer is there. A 401 on the way needs no
 * handling here: the request goes through `useApi()`, and an expired session
 * ends in the login redirect exactly as on any other request.
 *
 * Nothing polls. The three listeners below are attached once, the first time
 * anything registers, and serve the whole app; the set of refresh functions
 * only ever holds what is mounted right now. The one timer is the cap on a
 * running refresh (`REFRESH_WAIT_MS`), cleared the moment the refresh ends.
 */

/**
 * How long the app has to have been out of sight before coming back refetches
 * what it shows. Long enough that flicking to another app and back (copying an
 * address, answering a message) costs no request at all, short enough that
 * nobody returns to an afternoon-old list.
 */
export const RESUME_REFRESH_AFTER_MS = 5 * 60 * 1000

/**
 * How long a refresh may keep the button busy. Requests have no deadline of
 * their own, and one that never answers would otherwise leave every later
 * refresh joining it — the button spinning for good. Past this the refresh
 * counts as done; a late answer still lands, it just no longer holds anything
 * up.
 */
export const REFRESH_WAIT_MS = 20_000

type Refresh = () => void | Promise<void>

/** What is mounted right now and wants to be refreshed. */
const refreshers = new Set<Refresh>()

/** When the app was last seen leaving; null while it is on screen. */
let hiddenSince: number | null = null
let listening = false
let running: Promise<void> | null = null

/**
 * Whether a refresh is running — for the header button and the pull indicator.
 * Plain module state mirrored into it; see refreshAll().
 */
export function useRefreshing() {
  return useState('app-refreshing', () => false)
}

/**
 * Run every registered refresh function, once. A second call while one is
 * running joins it: the resume events often fire together, and a tap on the
 * button during a refresh is not helped by a second one behind it. One
 * function failing neither stops the others nor escapes as an unhandled
 * rejection.
 */
export async function refreshAll(): Promise<void> {
  if (running) return running
  const refreshing = useRefreshing()
  refreshing.value = true
  let cap: ReturnType<typeof setTimeout> | undefined
  const settled = (async () => {
    const results = await Promise.allSettled([...refreshers].map(async (refresh) => refresh()))
    for (const result of results) {
      if (result.status === 'rejected') console.error(result.reason)
    }
  })()
  running = Promise.race([
    settled,
    // eslint-disable-next-line promise/avoid-new -- ein Timer wird nur so zum Promise; es gibt hier nichts zu verketten
    new Promise<void>((resolve) => {
      cap = setTimeout(resolve, REFRESH_WAIT_MS)
    }),
  ])
  try {
    await running
  } finally {
    clearTimeout(cap)
    running = null
    refreshing.value = false
  }
}

function leave(): void {
  // Keep the earlier mark: `pagehide` after `visibilitychange` must not
  // restart the clock.
  hiddenSince ??= Date.now()
}

function resume(): void {
  const since = hiddenSince
  hiddenSince = null
  // The wall clock on purpose: a phone that slept for a night has to count
  // that night, which a monotonic clock that stops with the CPU would not.
  if (since !== null && Date.now() - since >= RESUME_REFRESH_AFTER_MS) void refreshAll()
}

/**
 * Coming back is reported two ways: `visibilitychange` to visible for a tab or
 * app switch, and `pageshow` with `persisted` for a page restored from the
 * back/forward cache — which may never have reported itself hidden, hence
 * `pagehide` counts as leaving, too.
 */
function listen(): void {
  if (listening) return
  listening = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') leave()
    else resume()
  })
  window.addEventListener('pagehide', leave)
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) resume()
  })
}

/** Register `refresh` for as long as the calling component is mounted. */
export function useRefreshable(refresh: Refresh): void {
  onMounted(() => {
    refreshers.add(refresh)
    listen()
  })
  onUnmounted(() => {
    refreshers.delete(refresh)
  })
}
