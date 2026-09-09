import type { BlaettchenIssue, BlaettchenListing } from '~~/shared/blaettchen'

/**
 * The Blättchen issues, fetched once and shared between the icon rail (which
 * hides its entry when there are none) and the /blaettchen page.
 *
 * `useState` rather than a module-level ref so the value is per-request on the
 * server and does not leak between users during SSR.
 */
export function useBlaettchen() {
  // The client with the 401 handling — see useApi().
  const api = useApi()

  const issues = useState<BlaettchenIssue[]>('blaettchen-issues', () => [])
  const contact = useState<string | null>('blaettchen-contact', () => null)
  const isLoading = useState('blaettchen-loading', () => false)
  const loadError = useState('blaettchen-error', () => false)
  const loaded = useState('blaettchen-loaded', () => false)
  // The rail is mounted twice (desktop + mobile) and both mount before the
  // first request resolves, so share the in-flight promise instead of firing
  // the same request twice.
  const inFlight = useState<Promise<void> | null>('blaettchen-inflight', () => null)

  /**
   * A failed load leaves `issues` empty, so the rail hides its entry rather
   * than offering a link into an error page. The failure is not swallowed —
   * the endpoint logs it server-side and answers 500, and `loadError` lets the
   * page tell "nothing published yet" apart from "could not load".
   */
  async function fetchIssues(): Promise<void> {
    isLoading.value = true
    loadError.value = false
    try {
      const listing = await api<BlaettchenListing>('/api/blaettchen')
      issues.value = listing.issues
      contact.value = listing.contact
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner api()-Aufruf: Fehler wird geloggt, leere Liste ist der Fallback
    } catch (error) {
      console.error(error)
      issues.value = []
      contact.value = null
      loadError.value = true
    } finally {
      isLoading.value = false
      loaded.value = true
    }
  }

  async function load(force = false): Promise<void> {
    if (loaded.value && !force) return
    if (inFlight.value && !force) return inFlight.value
    const run = fetchIssues()
    inFlight.value = run
    try {
      await run
    } finally {
      inFlight.value = null
    }
  }

  const hasIssues = computed(() => issues.value.length > 0)

  /** The download URL of an issue; the file name is a single path segment. */
  function urlFor(issue: BlaettchenIssue): string {
    return `/api/blaettchen/${encodeURIComponent(issue.file)}`
  }

  const { locale } = useI18n()

  /**
   * A publication date for reading. Noon rather than midnight: `2025-12-24`
   * parses as UTC, and formatting that instant west of Greenwich would show
   * the 23rd.
   */
  function formatDate(date: string): string {
    return new Date(`${date}T12:00:00`).toLocaleDateString(locale.value, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  return { issues, contact, hasIssues, isLoading, loadError, load, urlFor, formatDate }
}
