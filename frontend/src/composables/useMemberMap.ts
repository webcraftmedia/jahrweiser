import type {
  BoundaryLevel,
  BoundaryResolution,
  MapBoundaries,
  MapBoundaryLayer,
  MapOutline,
  MapPayload,
  MapPlace,
} from '~~/shared/map'

import { BOUNDARY_LEVELS, resolutionFor } from '~~/shared/map'

/** A rectangle of the map, in viewBox units. */
export interface MapViewport {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** How much bigger than the visible view the fetched region of names is. */
const PLACE_MARGIN = 0.6
/**
 * The same for the borders, and far smaller on purpose: a name is a few bytes
 * and a Kreis border is a few hundred, so the region that buys ordinary panning
 * without a request is worth much less here.
 *
 * A margin is paid for in *area*, which is the thing that is easy to
 * under-estimate: 0.3 a side grows the box to 1,6× in each direction and so to
 * **2,56× the area** — meaning three fifths of the geometry the client holds,
 * parses and rasterises on every pan can never be seen. At the zoom where the
 * district layer arrives that measured 135.000 vertices against the 53.000 the
 * screen could show. At 0.15 the area is 1,69× and a pan of a seventh of the
 * screen triggers the next request, which at 250 ms of debounce and a few tens
 * of kilobytes is the cheaper of the two.
 */
const BOUNDARY_MARGIN = 0.15
/** Refetch once the view is this much smaller than what was fetched for. */
const PLACE_DETAIL_FACTOR = 3
/**
 * The same for the borders, and much tighter, because the two are stale for
 * opposite reasons.
 *
 * A place answer goes stale by being too *coarse*: zoom in and the capped list
 * would now have room for villages it did not send, so the map waits until the
 * view is a third of what was asked for and then asks again. Nothing is lost in
 * the meantime — the names on screen are still the right ones.
 *
 * A border answer goes stale by being too *large*: zoom in and every arc it
 * holds for the four fifths of the region that has left the screen is still
 * rasterised on every single frame. Measured at the zoom the district layer
 * arrives at: the view needed 40.000 vertices and was drawing the 92.000 that
 * had been fetched two steps earlier. So this sits just under one press of the
 * zoom button (1.6), which means a step in fetches a border fitted to where the
 * reader now is, for a few tens of kilobytes.
 */
const BOUNDARY_DETAIL_FACTOR = 1.5

/**
 * Whether what was fetched for `known` still answers `view`.
 *
 * Two conditions, and the second is the one that is easy to forget: an answer
 * is also stale when the view has been zoomed far enough *into* it — see the
 * two factors above for the two quite different reasons that is so.
 */
function covers(known: MapViewport | null, view: MapViewport, detail: number): boolean {
  return (
    known !== null &&
    view.minX >= known.minX &&
    view.maxX <= known.maxX &&
    view.minY >= known.minY &&
    view.maxY <= known.maxY &&
    view.maxX - view.minX >= (known.maxX - known.minX) / detail
  )
}

/**
 * `held` without the levels that are not in `levels`, as a fresh object.
 *
 * Reads what is *held* rather than what is wanted, which is the direction that
 * has no dead branch in it: walking the wanted levels instead means asking
 * whether each is present, and "wanted but not held" cannot happen — `state` is
 * in every list `levelsInView` produces and is fetched before anything else, so
 * there is no state of this map in which a wanted level is missing while an
 * unwanted one is there.
 */
function onlyLevels<T>(
  held: Partial<Record<BoundaryLevel, T>>,
  levels: BoundaryLevel[],
): Partial<Record<BoundaryLevel, T>> {
  return Object.fromEntries(
    Object.entries(held).filter(([level]) => levels.includes(level as BoundaryLevel)),
  ) as Partial<Record<BoundaryLevel, T>>
}

/** The region to fetch for a view: the view plus a margin on every side. */
function grown(view: MapViewport, margin: number): MapViewport {
  const width = view.maxX - view.minX
  const height = view.maxY - view.minY
  return {
    minX: view.minX - width * margin,
    maxX: view.maxX + width * margin,
    minY: view.minY - height * margin,
    maxY: view.maxY + height * margin,
  }
}

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
    if (covers(known, view, PLACE_DETAIL_FACTOR)) return

    const box = grown(view, PLACE_MARGIN)
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

  /** The Bundesland and Kreis borders currently held, by level. */
  const boundaries = useState<Partial<Record<BoundaryLevel, MapBoundaryLayer>>>(
    'member-map-boundaries',
    () => ({}),
  )
  /**
   * The region each level was fetched for, and at which resolution — a view
   * that has zoomed in past what the copy in hand can show needs a finer one
   * even where the region it was given still covers it.
   */
  const boundaryBox = useState<
    Partial<Record<BoundaryLevel, MapViewport & { resolution: BoundaryResolution }>>
  >('member-map-boundary-box', () => ({}))

  /**
   * The administrative borders for what is on screen.
   *
   * Which levels are worth having is the *map's* decision, not this one's: it
   * knows its zoom, and a Kreis border is noise at country scale and the only
   * thing that says where you are once the silhouette has left the screen. Per
   * level, because they are wanted at different zooms — the state layer fetched
   * for the whole country stays good while the district layer is refetched at
   * every step in.
   */
  async function loadBoundaries(
    view: MapViewport,
    levels: BoundaryLevel[],
    perPixel: number,
  ): Promise<void> {
    // A level the map has stopped asking for is a level it has stopped
    // drawing — so let go of it rather than keeping it for a return visit.
    // Half a megabyte of Kreis path used to sit in the DOM at `opacity: 0` all
    // the way out to the country view, which is both a browser holding on to
    // geometry nothing can see and the reason zooming back in was slow from the
    // first frame. The map asks a whole zoom step *ahead* of drawing
    // (`PREFETCH`), so by the time a level drops off this list it has been
    // invisible for a while and there is no fade left to interrupt.
    if (BOUNDARY_LEVELS.some((level) => !levels.includes(level) && boundaries.value[level])) {
      boundaries.value = onlyLevels(boundaries.value, levels)
      boundaryBox.value = onlyLevels(boundaryBox.value, levels)
    }

    const resolution = resolutionFor(perPixel)
    const wanted = levels.filter((level) => {
      const held = boundaryBox.value[level]
      return held?.resolution !== resolution || !covers(held, view, BOUNDARY_DETAIL_FACTOR)
    })
    if (wanted.length === 0) return

    const box = { ...grown(view, BOUNDARY_MARGIN), resolution }
    const known = { ...boundaryBox.value }
    for (const level of wanted) boundaryBox.value[level] = box
    try {
      const answer = await api<MapBoundaries>('/api/map/boundaries', {
        query: { ...box, perPixel, levels: wanted.join(',') },
      })
      for (const level of wanted) {
        boundaries.value[level] = answer[level] ?? { d: '', labels: [] }
      }
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner api()-Aufruf: ohne Grenzen ist die Karte immer noch brauchbar
    } catch (error) {
      // A map without borders is still a map. Logged, not surfaced.
      console.error(error)
      boundaryBox.value = known
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
    boundaries,
    loadBoundaries,
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
