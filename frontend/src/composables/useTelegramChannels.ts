export interface TelegramChannel {
  name: string
  description?: string
  url: string
  public?: boolean
}

/**
 * The Telegram invitations, fetched once and shared between the icon rail
 * (which hides its entry when there are none) and the /telegram page.
 *
 * `useState` rather than a module-level ref so the value is per-request on the
 * server and does not leak between users during SSR.
 */
export function useTelegramChannels() {
  const channels = useState<TelegramChannel[]>('telegram-channels', () => [])
  const isLoading = useState('telegram-channels-loading', () => false)
  const loadError = useState('telegram-channels-error', () => false)
  const loaded = useState('telegram-channels-loaded', () => false)

  /**
   * A failed load leaves `channels` empty, so the rail hides its entry rather
   * than offering a link into an error page. The failure is not swallowed —
   * the endpoint logs it server-side and answers 500, and `loadError` lets the
   * page tell "nothing configured" apart from "could not load".
   */
  async function load(force = false): Promise<void> {
    if (loaded.value && !force) return
    isLoading.value = true
    loadError.value = false
    try {
      channels.value = await $fetch<TelegramChannel[]>('/api/telegram-channels')
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner $fetch: Fehler wird geloggt, leere Liste ist der Fallback
    } catch (error) {
      console.error(error)
      channels.value = []
      loadError.value = true
    } finally {
      isLoading.value = false
      loaded.value = true
    }
  }

  const hasChannels = computed(() => channels.value.length > 0)

  return { channels, hasChannels, isLoading, loadError, load }
}
