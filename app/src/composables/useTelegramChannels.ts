import type { TelegramChannel } from '~~/shared/telegram'

/**
 * The Telegram invitations, fetched once and shared between the icon rail
 * (which hides its entry when there are none) and the /telegram page.
 *
 * `useState` rather than a module-level ref so the value is per-request on the
 * server and does not leak between users during SSR.
 */
export function useTelegramChannels() {
  // The client with the 401 handling — see useApi().
  const api = useApi()

  const channels = useState<TelegramChannel[]>('telegram-channels', () => [])
  const isLoading = useState('telegram-channels-loading', () => false)
  const loadError = useState('telegram-channels-error', () => false)
  const loaded = useState('telegram-channels-loaded', () => false)
  // The rail is mounted twice (desktop + mobile) and both mount before the
  // first request resolves, so share the in-flight promise instead of firing
  // the same request twice.
  const inFlight = useState<Promise<void> | null>('telegram-channels-inflight', () => null)

  /**
   * A failed load leaves `channels` empty, so the rail hides its entry rather
   * than offering a link into an error page. The failure is not swallowed —
   * the endpoint logs it server-side and answers 500, and `loadError` lets the
   * page tell "nothing configured" apart from "could not load".
   */
  async function fetchChannels(): Promise<void> {
    isLoading.value = true
    loadError.value = false
    try {
      channels.value = await api<TelegramChannel[]>('/api/telegram-channels')
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner api()-Aufruf: Fehler wird geloggt, leere Liste ist der Fallback
    } catch (error) {
      console.error(error)
      channels.value = []
      loadError.value = true
    } finally {
      isLoading.value = false
      loaded.value = true
    }
  }

  /**
   * The quiet variant for `refresh()`: no loading state, and a failure keeps
   * the list that is on screen. That is the one difference to the rule above,
   * and a deliberate one — a phone that has just woken up often has no network
   * for its first second, and a rail entry vanishing over that would be wrong
   * far more often than a list that is really broken. The next visit to the
   * page loads properly and clears it then.
   */
  async function fetchChannelsQuietly(): Promise<void> {
    try {
      channels.value = await api<TelegramChannel[]>('/api/telegram-channels')
      loadError.value = false
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner api()-Aufruf: geloggt, die Liste bleibt beim letzten Stand
    } catch (error) {
      console.error(error)
    }
  }

  async function share(fetch: () => Promise<void>): Promise<void> {
    const run = fetch()
    inFlight.value = run
    try {
      await run
    } finally {
      inFlight.value = null
    }
  }

  async function load(force = false): Promise<void> {
    if (loaded.value && !force) return
    if (inFlight.value && !force) return inFlight.value
    return share(fetchChannels)
  }

  /**
   * Ask again for a member coming back to the app after a while (see
   * useRefreshable), without passing through the loading state. Joins a
   * request that is already on its way, which is also what keeps the two rail
   * instances down to one request between them.
   */
  async function refresh(): Promise<void> {
    if (inFlight.value) return inFlight.value
    return share(fetchChannelsQuietly)
  }

  const hasChannels = computed(() => channels.value.length > 0)

  return { channels, hasChannels, isLoading, loadError, load, refresh }
}
