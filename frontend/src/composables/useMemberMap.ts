import type { MapOutline, MapPayload, MapPlace } from '~~/shared/map'

/** A rectangle of the map, in viewBox units. */
export interface MapViewport {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** How much bigger than the visible view the fetched region is. */
const PLACE_MARGIN = 0.6
/** Refetch once the view is this much smaller than what was fetched for. */
const PLACE_DETAIL_FACTOR = 3

/**
 * The member map's client state, shared between the icon rail and /karte.
 *
 * Split into two calls on purpose: the rail needs to know on *every* page
 * whether the member has a postal code (to mark its entry as incomplete), and
 * that must not drag the whole aggregate along. The map data itself is only
 * fetched by the page.
 *
 * `useState` rather than module-level refs so the values are per-request on the
 * server and do not leak between users during SSR.
 */
export function useMemberMap() {
  // The client with the 401 handling — see useApi().
  const api = useApi()

  /** null while unknown — the rail shows no marker until it has an answer. */
  const hasPostalCode = useState<boolean | null>('member-map-has-plz', () => null)
  const statusLoaded = useState('member-map-status-loaded', () => false)
  // The rail is mounted twice (desktop + mobile) and both mount before the
  // first request resolves, so share the in-flight promise instead of firing
  // the same request twice.
  const statusInFlight = useState<Promise<void> | null>('member-map-status-inflight', () => null)

  const data = useState<MapPayload | null>('member-map-data', () => null)
  const outline = useState<MapOutline | null>('member-map-outline', () => null)
  const isLoading = useState('member-map-loading', () => false)
  const loadError = useState('member-map-error', () => false)
  /**
   * False until the first `load()` has come back either way. The page renders
   * its loading state on that rather than on `isLoading`, which is still false
   * during the very first paint — otherwise the map would flash its error
   * message before it has even asked.
   */
  const loaded = useState('member-map-loaded', () => false)
  /** True when the endpoint refused because the member has no postal code. */
  const isLocked = useState('member-map-locked', () => false)

  /** The areas to draw — empty until something has been loaded into them. */
  const areas = computed(() => data.value?.areas ?? [])

  const places = useState<MapPlace[]>('member-map-places', () => [])
  /** The region `places` was fetched for, to tell a new view from a known one. */
  const placeBox = useState<MapViewport | null>('member-map-place-box', () => null)

  /**
   * Place names for what is on screen.
   *
   * Fetched for a region rather than for the exact view, so ordinary panning
   * and a step of zoom need no request at all. A new one goes out when the view
   * leaves that region, or when it has been zoomed in far enough that the
   * answer would now have room for smaller places than were asked for.
   */
  async function loadPlaces(view: MapViewport): Promise<void> {
    const known = placeBox.value
    const covered =
      known !== null &&
      view.minX >= known.minX &&
      view.maxX <= known.maxX &&
      view.minY >= known.minY &&
      view.maxY <= known.maxY &&
      view.maxX - view.minX >= (known.maxX - known.minX) / PLACE_DETAIL_FACTOR
    if (covered) return

    const width = view.maxX - view.minX
    const height = view.maxY - view.minY
    const box: MapViewport = {
      minX: view.minX - width * PLACE_MARGIN,
      maxX: view.maxX + width * PLACE_MARGIN,
      minY: view.minY - height * PLACE_MARGIN,
      maxY: view.maxY + height * PLACE_MARGIN,
    }
    // Claim the region before awaiting, so a burst of view changes does not
    // produce a burst of identical requests.
    placeBox.value = box
    try {
      places.value = await api<MapPlace[]>('/api/map/places', { query: box })
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner api()-Aufruf: ohne Ortsnamen ist die Karte immer noch brauchbar
    } catch (error) {
      // A map without names is still a map. Logged, not surfaced.
      console.error(error)
      placeBox.value = known
    }
  }

  async function fetchStatus(): Promise<void> {
    try {
      const status = await api<{ hasPostalCode: boolean }>('/api/map/status')
      hasPostalCode.value = status.hasPostalCode
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner api()-Aufruf: bei Fehler bleibt der Status unbekannt
    } catch (error) {
      // Unknown stays unknown: claiming "no postal code" on a failed request
      // would put a warning marker on the rail that nothing can clear.
      console.error(error)
      hasPostalCode.value = null
    } finally {
      statusLoaded.value = true
    }
  }

  /** Whether the member has a postal code on file. Cheap; called by the rail. */
  async function loadStatus(force = false): Promise<void> {
    if (statusLoaded.value && !force) return
    if (statusInFlight.value && !force) return statusInFlight.value
    const run = fetchStatus()
    statusInFlight.value = run
    try {
      await run
    } finally {
      statusInFlight.value = null
    }
  }

  /**
   * The aggregate plus the country silhouette. A 403 is not an error — it is
   * the documented answer for "you have not given your own postal code yet",
   * and the page shows its locked preview for it.
   */
  async function load(): Promise<void> {
    isLoading.value = true
    loadError.value = false
    isLocked.value = false
    try {
      // The silhouette comes from its own endpoint: it is the same for
      // everyone and the locked preview needs it too, so it must not sit
      // behind the postal-code gate. Both are needed to draw anything.
      const [payload, shape] = await Promise.all([
        api<MapPayload>('/api/map/members').catch((error: unknown) => {
          const status = error as { statusCode?: number; response?: { status?: number } }
          if ((status.statusCode ?? status.response?.status) === 403) {
            isLocked.value = true
            return null
          }
          throw error
        }),
        outline.value ? Promise.resolve(outline.value) : api<MapOutline>('/api/map/outline'),
      ])
      data.value = payload
      outline.value = shape
      hasPostalCode.value = !isLocked.value
      // eslint-disable-next-line no-catch-all/no-catch-all -- geloggt; die Seite zeigt ihren Fehlerzustand
    } catch (error) {
      console.error(error)
      data.value = null
      loadError.value = true
    } finally {
      isLoading.value = false
      loaded.value = true
    }
  }

  return {
    data,
    areas,
    places,
    outline,
    hasPostalCode,
    isLocked,
    isLoading,
    loaded,
    loadError,
    load,
    loadPlaces,
    loadStatus,
  }
}
