<script setup lang="ts">
  import type {
    BoundaryLevel,
    MapArea,
    MapBoundaryLabel,
    MapBoundaryLayer,
    MapOutline,
    MapPlace,
  } from '~~/shared/map'

  import { MAP_ATTRIBUTION } from '~~/shared/map'

  /**
   * Where the members are, one number per postal code.
   *
   * Hand-drawn inline SVG, same reasoning as AdminTrendChart: the bundle is
   * measured against a 220 kB budget and a mapping library would eat most of
   * what is left. The geometry arrives ready-made from the server — projected
   * and simplified at build time by scripts/build-map-data.ts — so this
   * component only has to frame and paint it.
   *
   * Two channels, one variable: the area is filled with a step of a single-hue
   * sequential ramp, and carries a dot at its centroid. The dot is what makes
   * city postal codes visible at all — Berlin-Mitte is a few hundred metres
   * across and disappears at country scale — and it anchors the number.
   *
   * Everything except the tooltip lives inside the SVG, in viewBox units. An
   * HTML overlay would have to be told where the drawing actually ended up,
   * which means the container could never letterbox — and that is what lets the
   * map be fitted into the height the page has left.
   */
  const props = defineProps<{
    outline: MapOutline
    areas: MapArea[]
    /** Towns and villages to name, most important first. */
    places?: MapPlace[]
    /**
     * Bundesland and Kreis borders for the current view. Which of them are
     * worth having is decided here and asked for through `viewport` — see the
     * staging below.
     */
    boundaries?: Partial<Record<BoundaryLevel, MapBoundaryLayer>>
    /**
     * A preview with made-up numbers, shown blurred to members who have not
     * given their own postal code. Skips the tooltip, the controls and the data
     * table: there is nothing behind it to look at more closely.
     */
    decorative?: boolean
    /** Accessible name; also the caption of the data table. */
    title: string
  }>()

  /**
   * The rectangle now on screen and the administrative levels it has room for,
   * so whoever owns the data can fetch the names and borders for it. Debounced
   * — a drag would otherwise emit on every frame.
   */
  const emit = defineEmits<{
    viewport: [{ minX: number; minY: number; maxX: number; maxY: number; levels: BoundaryLevel[] }]
  }>()

  const { t } = useI18n()
  // Dark mode as a class of this component rather than the global `.dark`: a
  // scoped `:global(.dark) .x` rule does not survive this build. The minifier
  // folds it into a selector list and loses the descendant part, so the dark
  // colours silently never apply. A plain scoped descendant selector does.
  const { isDark } = useColorMode()

  /** The full coordinate system the server's path data lives in. */
  const full = computed(() => {
    const [, , width, height] = props.outline.viewBox.split(/\s+/).map(Number)
    return { width: width || 1, height: height || 1 }
  })

  // --- framing -------------------------------------------------------------

  /**
   * The view is a centre plus a width; the height follows from the full map's
   * proportions, so the shape can never be squeezed. Where that rectangle does
   * not match the container, `preserveAspectRatio` shows a little more than was
   * asked for rather than distorting anything.
   */
  interface View {
    cx: number
    cy: number
    w: number
  }

  /** The width assumed until the map has been measured once. */
  const NOMINAL_WIDTH = 640

  /**
   * How far in the map can be zoomed, as a multiple of the country view. At 200
   * the frame is about three kilometres across — close enough to see which side
   * of a village a postal code ends on.
   *
   * It is also well past what the geometry resolves. The coordinate system is
   * 12.000 units across Germany, about 53 m, which at this zoom is some twenty
   * pixels: boundaries read as a staircase of that step, and a real feature
   * narrower than it — the corridor to an exclave — has collapsed into a single
   * line. Deliberately left as it is; the alternatives are a finer grid at some
   * 40 to 80 % on every payload, or taking the zoom away. See docu/karte.md.
   */
  const MAX_ZOOM = 200
  /** One press of a zoom button. */
  const ZOOM_STEP = 1.6
  /** Breathing room around the fitted extent, as a share of its size. */
  const FIT_PADDING = 0.18

  function clamp(view: View): View {
    const w = Math.min(full.value.width, Math.max(full.value.width / MAX_ZOOM, view.w))
    const h = w * (full.value.height / full.value.width)
    // Panning stops at the edge of the map: there is nothing out there.
    const cx = Math.min(Math.max(view.cx, w / 2), full.value.width - w / 2)
    const cy = Math.min(Math.max(view.cy, h / 2), full.value.height - h / 2)
    return { cx, cy, w }
  }

  /**
   * The opening view: everything the members cover, plus a margin. Fitting to
   * the data rather than to the country is the difference between a map of this
   * community and a map of Germany with a few specks on it.
   */
  const fitted = computed<View>(() => {
    if (props.areas.length === 0) {
      return { cx: full.value.width / 2, cy: full.value.height / 2, w: full.value.width }
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const area of props.areas) {
      minX = Math.min(minX, area.cx)
      maxX = Math.max(maxX, area.cx)
      minY = Math.min(minY, area.cy)
      maxY = Math.max(maxY, area.cy)
    }
    const ratio = full.value.height / full.value.width
    // Whichever side is the binding one, expressed as a width.
    const width = Math.max(maxX - minX, (maxY - minY) / ratio, full.value.width / MAX_ZOOM)
    return clamp({
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      w: width * (1 + 2 * FIT_PADDING),
    })
  })

  /** null = still showing the fitted view. */
  const framed = ref<View | null>(null)
  const view = computed(() => framed.value ?? fitted.value)

  // A different set of areas means a different extent — start from it.
  watch(
    () => props.areas,
    () => {
      framed.value = null
    },
  )

  const viewBox = computed(() => {
    const { cx, cy, w } = view.value
    const h = w * (full.value.height / full.value.width)
    return `${cx - w / 2} ${cy - h / 2} ${w} ${h}`
  })

  function zoomBy(factor: number, at?: { x: number; y: number }): void {
    const before = view.value
    const next = clamp({ ...before, w: before.w / factor })
    // Keep the point under the cursor where it is; without an anchor the
    // centre stays put.
    if (at && next.w !== before.w) {
      const shift = 1 - next.w / before.w
      framed.value = clamp({
        cx: before.cx + (at.x - before.cx) * shift,
        cy: before.cy + (at.y - before.cy) * shift,
        w: next.w,
      })
      return
    }
    framed.value = next
  }

  // --- pointer -------------------------------------------------------------

  const svg = useTemplateRef<SVGSVGElement>('svg')

  /**
   * The size the map is actually drawn at. Measured rather than assumed: the
   * page hands the map whatever height is left, so how many viewBox units go
   * into a pixel is not knowable up front — and everything chosen in pixels
   * (dots, type) would come out at the wrong size if it were guessed.
   */
  const frame = ref<{ width: number; height: number } | null>(null)

  onMounted(() => {
    // Absent in some test environments; the nominal width then stands in.
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect && rect.width > 0 && rect.height > 0) {
        frame.value = { width: rect.width, height: rect.height }
      }
    })
    observer.observe(svg.value!)
    onBeforeUnmount(() => {
      observer.disconnect()
    })
  })

  /**
   * viewBox units per CSS pixel. `preserveAspectRatio="meet"` fits the whole
   * view inside the box, so the scale is whichever axis ran out first. Before
   * the first measurement, a nominal width stands in.
   */
  const unit = computed(() => {
    const h = view.value.w * (full.value.height / full.value.width)
    if (!frame.value) return view.value.w / NOMINAL_WIDTH
    return Math.max(view.value.w / frame.value.width, h / frame.value.height)
  })

  /**
   * What is actually on screen.
   *
   * Not the same as the view: `preserveAspectRatio="meet"` fits the requested
   * rectangle *inside* the box and fills the rest with map on either side. A
   * wide window therefore shows far more to the left and right than was asked
   * for — and anything culled against the request alone leaves the names
   * huddled in a narrow strip down the middle.
   */
  const visible = computed(() => {
    const height = view.value.w * (full.value.height / full.value.width)
    if (!frame.value) return { w: view.value.w, h: height }
    return { w: frame.value.width * unit.value, h: frame.value.height * unit.value }
  })

  /**
   * Where an event landed, in viewBox units. `offsetX/Y` rather than a fresh
   * measurement: it is already relative to the element, and the size of that
   * element is something this component is told about, not something it should
   * go and ask for on every wheel tick.
   */
  function pointAt(event: WheelEvent): { x: number; y: number } {
    const size = frame.value ?? { width: NOMINAL_WIDTH, height: NOMINAL_WIDTH }
    const perPixel = unit.value
    const h = view.value.w * (full.value.height / full.value.width)
    // The drawing is centred in its box; the letterbox margins are the rest.
    const marginX = (size.width - view.value.w / perPixel) / 2
    const marginY = (size.height - h / perPixel) / 2
    return {
      x: view.value.cx - view.value.w / 2 + (event.offsetX - marginX) * perPixel,
      y: view.value.cy - h / 2 + (event.offsetY - marginY) * perPixel,
    }
  }

  const dragging = ref(false)
  let dragFrom: { x: number; y: number; cx: number; cy: number } | null = null

  function onPointerDown(event: PointerEvent): void {
    if (props.decorative || event.button !== 0) return
    dragging.value = true
    dragFrom = { x: event.clientX, y: event.clientY, cx: view.value.cx, cy: view.value.cy }
    // So a drag that starts on the map keeps receiving moves once the pointer
    // has left it.
    ;(event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragFrom) return
    const perPixel = unit.value
    framed.value = clamp({
      cx: dragFrom.cx - (event.clientX - dragFrom.x) * perPixel,
      cy: dragFrom.cy - (event.clientY - dragFrom.y) * perPixel,
      w: view.value.w,
    })
  }

  function onPointerUp(): void {
    dragging.value = false
    dragFrom = null
  }

  function onWheel(event: WheelEvent): void {
    if (props.decorative) return
    // The page is laid out to fit, so there is no scrolling to take away here.
    zoomBy(event.deltaY < 0 ? 1.2 : 1 / 1.2, pointAt(event))
  }

  // --- orientation ---------------------------------------------------------

  /**
   * Where the reader is, rather than what the data says.
   *
   * The country silhouette answers that in the opening view and stops answering
   * it the moment anyone zooms in: three postal codes and a few village names
   * on an empty page could be anywhere in Germany. So the same job is handed
   * down the administrative ladder as the map grows — Bundesland, then Kreis —
   * and each layer appears at the scale where its areas are big enough to read
   * and disappears before they are so big that the reader is inside one.
   *
   * The trigger is the width of the view relative to the whole country, which
   * is a scale and not a zoom step: it means the same thing on a phone and on
   * a wall screen, where the same zoom level shows quite different amounts of
   * map. Germany is about 640 km across, so 0.25 is roughly a 160 km view.
   *
   * Nothing here is a switch the reader has to find. A layer that is noise at
   * this scale is not offered and then hidden; it is simply not yet drawn.
   */
  const STAGE = {
    /** Kreis borders, over 180 → 100 km: the line comes well before the name. */
    districtBorder: { off: 0.28, on: 0.16 },
    /**
     * The handover between the two sets of names, over 120 → 98 km.
     *
     * Deliberately a narrow band, and narrower than one press of the zoom
     * button: type at a third of its opacity is not a label that is arriving,
     * it is a smudge. Crossing the band in one step reads as a handover; sitting
     * in the middle of it reads as a fault.
     */
    districtName: { off: 0.19, on: 0.155 },
    /** The Bundesland names go the other way over roughly the same stretch. */
    stateName: { off: 0.155, on: 0.24 },
  }

  /**
   * Fetched a little before it is drawn: a layer that is asked for at the
   * moment it becomes visible arrives into a view that has already started
   * fading it in, and pops.
   */
  const PREFETCH = 1.25

  /** The view's width as a share of the whole country. */
  const span = computed(() => view.value.w / full.value.width)

  /** 0 at `off`, 1 at `on`, linear between — `on` may lie either side. */
  function staged({ off, on }: { off: number; on: number }): number {
    return Math.max(0, Math.min(1, (span.value - off) / (on - off)))
  }

  const districtBorderOpacity = computed(() => staged(STAGE.districtBorder))
  const districtNameOpacity = computed(() => staged(STAGE.districtName))
  const stateNameOpacity = computed(() => staged(STAGE.stateName))

  /** Which levels are worth asking the server for at this scale. */
  const levelsInView = computed<BoundaryLevel[]>(() => {
    const levels: BoundaryLevel[] = ['state']
    if (span.value < STAGE.districtBorder.off * PREFETCH) levels.push('district')
    return levels
  })

  /** Below this on screen a name is a smudge, not a word. */
  const MIN_LABEL_PX = 8.5

  /**
   * The type size a name may have if it is to sit inside its own area — and 0
   * when it cannot.
   *
   * √area is the side of the square of the same area: a fair stand-in for the
   * room a name has in a shape nobody has measured the width of, and it is why
   * a Kreis name appears as the map grows without anything deciding at which
   * zoom it should. A name that would have to be set smaller than it can be
   * read is not set at all — the alternative is a grey smudge that looks like
   * a rendering fault.
   */
  function nameSize(name: string, size: number, nominal: number, perCharacter: number): number {
    const room = Math.sqrt(Math.max(size, 0)) * 0.85
    const wanted = Math.min(nominal, room / (perCharacter * name.length + 0.4))
    return wanted < MIN_LABEL_PX * unit.value ? 0 : wanted
  }

  /** One administrative name, ready to draw. */
  interface AreaLabel {
    label: MapBoundaryLabel
    size: number
  }

  /** Only what is on screen may take up space — and be paid for in layout. */
  function onScreen(point: { x: number; y: number }): boolean {
    return (
      Math.abs(point.x - view.value.cx) <= visible.value.w / 2 &&
      Math.abs(point.y - view.value.cy) <= visible.value.h / 2
    )
  }

  /**
   * The Bundesland names, set as large as their own area allows.
   *
   * No collision handling: there are sixteen of them, they are pale enough to
   * be read through, and they are drawn *under* everything that carries a value
   * — which is what a name at this size has to be, background and not mark.
   */
  const stateLabels = computed<AreaLabel[]>(() =>
    // Not gated on the opacity: kept in the DOM while it fades, so the fade is
    // a fade and not a disappearance. They take no space from anything.
    (props.boundaries?.state?.labels ?? [])
      .filter(onScreen)
      .map((label) => ({
        label,
        // Tracked out by a quarter em, so every character costs a quarter more.
        size: nameSize(label.name, label.size, 26 * unit.value, 0.72),
      }))
      .filter((entry) => entry.size > 0),
  )

  // --- marks ---------------------------------------------------------------

  /** Label size in viewBox units — about 13 px, whatever the zoom. */
  const fontSize = computed(() => 13 * unit.value)

  /**
   * Class breaks for the fill, doubling each step. Fixed rather than derived
   * from the data so the map means the same thing from one visit to the next —
   * a postal code does not change colour because somewhere else grew.
   */
  const CLASS_EDGES = [2, 4, 8, 16]

  /** 1–5, the step of the sequential ramp a count belongs in. */
  function stepFor(count: number): number {
    return CLASS_EDGES.filter((edge) => count >= edge).length + 1
  }

  /** The legend, one entry per class. `to` null = the open-ended top class. */
  const legend = computed<{ step: number; from: number; to: number | null }[]>(() => [
    ...CLASS_EDGES.map((edge, index) => ({
      step: index + 1,
      from: index === 0 ? 1 : CLASS_EDGES[index - 1],
      to: edge - 1,
    })),
    { step: CLASS_EDGES.length + 1, from: CLASS_EDGES[CLASS_EDGES.length - 1], to: null },
  ])

  /**
   * Dot radius in viewBox units. Area-proportional (√count) — but never smaller
   * than the number it has to hold.
   *
   * The floor costs a little of the size encoding at the low end, where the
   * fill still says how many, and buys the thing that matters: every number
   * sits *inside* its dot, and can therefore be coloured for contrast against
   * that dot rather than against a page it is only half covering.
   */
  function radius(count: number): number {
    const digits = String(count).length
    const fits = fontSize.value * (0.32 * digits + 0.42)
    return Math.max((5 + 2.5 * Math.sqrt(count)) * unit.value, fits)
  }

  /** Big shapes first, so a city that sits inside a large area lands on top. */
  const painted = computed(() => [...props.areas].sort((a, b) => b.size - a.size))

  /**
   * A dot on the map: one postal code, or several whose dots would have covered
   * each other at this zoom.
   */
  interface Mark {
    /** The postal codes behind it — the key, and nothing the reader sees. */
    key: string
    cx: number
    cy: number
    count: number
  }

  /**
   * The dots, with the overlapping ones merged into one that carries the sum.
   *
   * Zoomed out to the country, neighbouring postal codes are closer together
   * than their dots are wide. Drawing them anyway put one circle on top of
   * another and the label pass then dropped whichever number lost — so the map
   * showed "2" where three members live, and the reader had no way to tell that
   * anything was missing. A merged dot says 3, and grows and colours like any
   * other dot carrying 3.
   *
   * Merging is by overlap and transitive: A over B and B over C is one dot,
   * because leaving A and C separate would leave them overlapping again. Each
   * merge makes the surviving dot bigger, which can bring it over a fourth, so
   * the passes repeat until one changes nothing. Nothing here is a *decision*
   * about scale — zoom in and the dots shrink in map units, the overlaps stop,
   * and the codes come apart again on their own.
   *
   * What this does not touch is the areas: the shapes stay one per postal code,
   * as does the table underneath. The dot is a mark on the map, not the datum.
   */
  const marks = computed<Mark[]>(() => {
    // Biggest first, so a cluster forms around the postal code that dominates
    // it rather than around whichever one the data happens to list first.
    let current = [...props.areas]
      .sort((a, b) => b.count - a.count || a.plz.localeCompare(b.plz))
      .map((area) => ({ plz: [area.plz], cx: area.cx, cy: area.cy, count: area.count }))

    for (;;) {
      const next: typeof current = []
      let merged = false
      for (const mark of current) {
        const host = next.find(
          (other) =>
            Math.hypot(other.cx - mark.cx, other.cy - mark.cy) <
            radius(other.count) + radius(mark.count),
        )
        if (!host) {
          next.push({ ...mark, plz: [...mark.plz] })
          continue
        }
        // Weighted by members, so the dot sits where most of them are rather
        // than halfway to a postal code that contributed one.
        const total = host.count + mark.count
        host.cx = (host.cx * host.count + mark.cx * mark.count) / total
        host.cy = (host.cy * host.count + mark.cy * mark.count) / total
        host.count = total
        host.plz.push(...mark.plz)
        merged = true
      }
      current = next
      if (!merged) break
    }

    return (
      current
        .map((mark) => ({
          // Sorted, so the key does not depend on the order the merges happened
          // in — Vue would otherwise re-create every dot on a step of zoom.
          key: [...mark.plz].sort().join(' '),
          cx: mark.cx,
          cy: mark.cy,
          count: mark.count,
        }))
        // Biggest first: a small dot next to a large one stays on top of it.
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    )
  })

  /** Place names are context, so they are set smaller than the numbers. */
  const placeFontSize = computed(() => 10.5 * unit.value)

  /** Beyond this the map is a wall of names and no longer a map. */
  const MAX_PLACE_LABELS = 70

  /** The same for the Kreise, which are far larger and so far fewer. */
  const MAX_DISTRICT_LABELS = 16

  interface Rect {
    x: number
    y: number
    w: number
    h: number
  }

  const overlaps = (a: Rect, b: Rect): boolean =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

  interface PlacedLabel {
    /** Anything with a name and a point — a town, or a Kreis. */
    place: { name: string; x: number; y: number }
    x: number
    y: number
    anchor: 'middle' | 'start' | 'end'
    rect: Rect
  }

  /** What a name of `size` needs, in map units, at `perCharacter` per letter. */
  function labelRect(
    label: { name: string; x: number; y: number },
    size: number,
    perCharacter: number,
  ): Rect {
    const width = size * (perCharacter * label.name.length + 0.4)
    return { x: label.x - width / 2, y: label.y - size * 0.6, w: width, h: size * 1.2 }
  }

  /**
   * Where a place's name can go, if anywhere.
   *
   * Tried below the dot first, then above, then to either side, each at
   * increasing distance. A single fixed position would silence exactly the
   * names that matter most: a town with members has a dot sitting on it, and
   * the name would be blocked by the very mark it belongs to — leaving the
   * smaller village next door labelled and the town itself anonymous.
   */
  function placeLabel(place: MapPlace, size: number, taken: Rect[]): PlacedLabel | null {
    const width = size * (0.55 * place.name.length + 0.4)
    for (const gap of [0.7, 1.7, 2.8]) {
      const distance = size * gap
      const candidates: Omit<PlacedLabel, 'place' | 'rect'>[] = [
        { x: place.x, y: place.y + distance + size * 0.8, anchor: 'middle' },
        { x: place.x, y: place.y - distance, anchor: 'middle' },
        { x: place.x + distance, y: place.y + size * 0.35, anchor: 'start' },
        { x: place.x - distance, y: place.y + size * 0.35, anchor: 'end' },
      ]
      for (const candidate of candidates) {
        const left =
          candidate.anchor === 'middle'
            ? candidate.x - width / 2
            : candidate.anchor === 'start'
              ? candidate.x
              : candidate.x - width
        const rect = { x: left, y: candidate.y - size * 0.85, w: width, h: size * 1.1 }
        if (taken.some((other) => overlaps(rect, other))) continue
        return { place, ...candidate, rect }
      }
    }
    return null
  }

  /**
   * What actually gets written on the map, in one pass so that everything
   * competes for the same space.
   *
   * The order is the priority: the member dots hold their ground, numbers and
   * all, and place names take what is left. Everything is measured in map units
   * at the current zoom — and since the type keeps its size on screen, it
   * *shrinks* in map units as the map grows, which is what makes a village's
   * name appear as soon as somebody zooms in far enough for it to fit.
   */
  const layout = computed(() => {
    const placeSize = placeFontSize.value

    // The dots are placed by the data, not by this; they only block.
    const blocked: Rect[] = marks.value.map((mark) => {
      const r = radius(mark.count)
      return { x: mark.cx - r, y: mark.cy - r, w: 2 * r, h: 2 * r }
    })

    // Every number is drawn: there used to be a pass here that dropped a count
    // whose box covered one already placed, and merging the dots made it
    // unreachable. The radius floor holds a label of `digits` digits inside a
    // dot of `0.32·digits + 0.42` ems while the box it needs is
    // `0.31·digits + 0.25` wide and 0.6 tall — so a number always sits strictly
    // inside its own dot, and dots no longer overlap.

    const taken = [...blocked]

    // The Bundesland name is set under everything and placed by nothing, but it
    // still holds its ground: a village name printed across it leaves two
    // unreadable words instead of one legible one, and the village has eighty
    // other places to be.
    if (stateNameOpacity.value > 0) {
      for (const entry of stateLabels.value) {
        taken.push(labelRect(entry.label, entry.size, 0.72))
      }
    }

    // The Kreis names go next, and that is the whole point of them: a reader
    // who cannot tell where they are is not helped by the name of the next
    // village along. They sit at their own label point or nowhere — a Kreis
    // name shifted aside to dodge a village would be pointing at the wrong
    // area, which is worse than missing.
    const districts: (PlacedLabel & { size: number })[] = []
    if (districtNameOpacity.value > 0) {
      for (const label of props.boundaries?.district?.labels ?? []) {
        if (!onScreen(label)) continue
        const size = nameSize(label.name, label.size, 12 * unit.value, 0.55)
        if (size === 0) continue
        const rect = labelRect(label, size, 0.55)
        if (taken.some((other) => overlaps(rect, other))) continue
        taken.push(rect)
        districts.push({ place: label, x: label.x, y: label.y, anchor: 'middle', rect, size })
        // The server sends them largest first, so this keeps the Kreise a
        // reader is most likely inside of. Without it, a view over the Ruhr is
        // twenty names deep before a single town is written.
        if (districts.length >= MAX_DISTRICT_LABELS) break
      }
    }

    // Only what is on screen may take up space; an off-screen village must not
    // spend a slot a visible one could have had.
    const places: PlacedLabel[] = []
    for (const place of props.places ?? []) {
      if (!onScreen(place)) continue
      const label = placeLabel(place, placeSize, taken)
      if (!label) continue
      taken.push(label.rect)
      places.push(label)
      if (places.length >= MAX_PLACE_LABELS) break
    }

    return { places, districts }
  })

  /**
   * Tell the owner which rectangle is on screen, once the panning has settled.
   */
  let viewportTimer: ReturnType<typeof setTimeout> | undefined
  watch(
    [view, visible],
    ([current]) => {
      if (props.decorative) return
      clearTimeout(viewportTimer)
      viewportTimer = setTimeout(() => {
        // The rectangle actually on screen, not the one that was asked for.
        emit('viewport', {
          minX: current.cx - visible.value.w / 2,
          maxX: current.cx + visible.value.w / 2,
          minY: current.cy - visible.value.h / 2,
          maxY: current.cy + visible.value.h / 2,
          levels: levelsInView.value,
        })
      }, 250)
    },
    { immediate: true },
  )
  onBeforeUnmount(() => {
    clearTimeout(viewportTimer)
  })

  /**
   * The two numbers that label the ramp where the classes have no room. Derived
   * from the breaks by reduction rather than by indexing, so there is no "what
   * if the list were empty" branch to answer for.
   */
  const legendEnds = {
    from: '1',
    to: `${CLASS_EDGES.reduce((top, edge) => Math.max(top, edge), 1)}+`,
  }

  const total = computed(() => props.areas.reduce((sum, area) => sum + area.count, 0))
</script>

<template>
  <figure class="m-0 flex min-h-0 flex-col" :class="{ 'is-dark': isDark }">
    <div class="relative min-h-0 flex-1">
      <svg
        ref="svg"
        :viewBox="viewBox"
        preserveAspectRatio="xMidYMid meet"
        class="block h-full max-h-full w-full touch-none"
        :class="decorative ? '' : dragging ? 'cursor-grabbing' : 'cursor-grab'"
        :role="decorative ? 'presentation' : 'img'"
        :aria-hidden="decorative ? 'true' : undefined"
        :aria-label="decorative ? undefined : title"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @wheel.prevent="onWheel"
      >
        <!-- The country, recessive: it orients, it carries no value. -->
        <path class="map-country" :d="outline.d" />

        <!-- The same job at the next two scales down, faded in as the country
             leaves the screen. Under the areas and under the dots: this is
             where the reader is, not what the map says. -->
        <path
          v-if="boundaries?.district"
          class="map-district"
          :style="{ opacity: districtBorderOpacity }"
          :d="boundaries.district.d"
        />
        <path v-if="boundaries?.state" class="map-state" :d="boundaries.state.d" />

        <g
          v-if="stateLabels.length > 0"
          class="state-names"
          :style="{ opacity: stateNameOpacity }"
          aria-hidden="true"
        >
          <text
            v-for="entry in stateLabels"
            :key="entry.label.name"
            :x="entry.label.x"
            :y="entry.label.y"
            :style="{ fontSize: `${entry.size}px` }"
            text-anchor="middle"
            dominant-baseline="central"
          >
            {{ entry.label.name.toLocaleUpperCase('de-DE') }}
          </text>
        </g>

        <g class="areas">
          <path
            v-for="area in painted"
            :key="area.plz"
            :class="`step-${stepFor(area.count)}`"
            :d="area.d"
          />
        </g>

        <!-- The Kreis, named where its own label point is. Above the areas,
             unlike its border: this is the line of text the reader is looking
             for when the silhouette has gone. -->
        <g
          v-if="layout.districts.length > 0"
          class="district-names"
          :style="{ opacity: districtNameOpacity }"
          aria-hidden="true"
        >
          <text
            v-for="entry in layout.districts"
            :key="entry.place.name"
            :x="entry.x"
            :y="entry.y"
            :style="{ fontSize: `${entry.size}px` }"
            text-anchor="middle"
            dominant-baseline="central"
          >
            {{ entry.place.name }}
          </text>
        </g>

        <!-- Towns and villages, recessive: they say where this is, nothing more. -->
        <g class="places" :style="{ fontSize: `${placeFontSize}px` }" aria-hidden="true">
          <g
            v-for="label in layout.places"
            :key="`${label.place.name}-${label.place.x}-${label.place.y}`"
          >
            <circle :cx="label.place.x" :cy="label.place.y" :r="placeFontSize * 0.16" />
            <text :x="label.x" :y="label.y" :text-anchor="label.anchor">
              {{ label.place.name }}
            </text>
          </g>
        </g>

        <g class="dots">
          <circle
            v-for="mark in marks"
            :key="mark.key"
            :class="`step-${stepFor(mark.count)}`"
            :cx="mark.cx"
            :cy="mark.cy"
            :r="radius(mark.count)"
          />
        </g>

        <!-- The number wears ink with a halo of the surface colour, so it stays
             readable over any step of the ramp without a box around it. -->
        <g class="labels" :style="{ fontSize: `${fontSize}px` }" aria-hidden="true">
          <text
            v-for="mark in marks"
            :key="mark.key"
            :class="`step-${stepFor(mark.count)}`"
            :x="mark.cx"
            :y="mark.cy"
            text-anchor="middle"
            dominant-baseline="central"
          >
            {{ mark.count }}
          </text>
        </g>
      </svg>

      <!-- Where every map carries it: in a corner of the map itself, costing no
           height. ODbL and CC BY require it to be there — quiet is as small as
           it may get. -->
      <p
        v-if="!decorative"
        class="pointer-events-none absolute bottom-0 right-0 max-w-full truncate pl-2 text-[0.625rem] leading-4 font-body text-navy/35 dark:text-ivory/35"
      >
        {{ MAP_ATTRIBUTION }}
      </p>

      <div v-if="!decorative" class="absolute right-2 top-2 flex flex-col gap-1">
        <button
          v-for="control in [
            { key: 'in', label: t('components.MemberMap.zoom-in'), sign: '+' },
            { key: 'out', label: t('components.MemberMap.zoom-out'), sign: '−' },
          ]"
          :key="control.key"
          type="button"
          class="map-button"
          :title="control.label"
          :aria-label="control.label"
          @click="zoomBy(control.key === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP)"
        >
          {{ control.sign }}
        </button>
      </div>
    </div>

    <!-- The scale, always present: the fill is the only thing that says how
         many, and it must never rest on colour the reader has to guess at. -->
    <!-- One line, always. On a phone the classes are a bare ramp with its ends
         labelled left and right, and whatever the page has to say about the
         numbers sits on the same line rather than costing another one. -->
    <figcaption
      v-if="!decorative"
      class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-body text-navy/70 dark:text-ivory/70"
    >
      <span class="hidden shrink-0 sm:inline">{{ t('components.MemberMap.legend') }}</span>
      <span class="flex shrink-0 items-center gap-x-1.5 sm:gap-x-2">
        <span class="sm:hidden">{{ legendEnds.from }}</span>
        <span v-for="entry in legend" :key="entry.step" class="flex items-center gap-1.5">
          <span class="swatch" :class="`step-${entry.step}`" aria-hidden="true" />
          <span class="hidden sm:inline">
            {{ entry.to ? `${entry.from}–${entry.to}` : `${entry.from}+` }}
          </span>
        </span>
        <span class="sm:hidden">{{ legendEnds.to }}</span>
      </span>
      <span class="text-navy/60 dark:text-poster-darkMuted"><slot name="caption" /></span>
    </figcaption>

    <!-- The same numbers, reachable without seeing the map. -->
    <table v-if="!decorative" class="sr-only">
      <caption>
        {{
          title
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col">{{ t('components.MemberMap.table.postalCode') }}</th>
          <th scope="col">{{ t('components.MemberMap.table.place') }}</th>
          <th scope="col">{{ t('components.MemberMap.table.count') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="area in areas" :key="area.plz">
          <th scope="row">{{ area.plz }}</th>
          <td>{{ area.ort }}</td>
          <td>{{ area.count }}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colspan="2">{{ t('components.MemberMap.table.total') }}</th>
          <td>{{ total }}</td>
        </tr>
      </tfoot>
    </table>
  </figure>
</template>

<style scoped>
  /* One hue, light → dark: this is magnitude, not identity. The dark steps are
     chosen against the dark surface rather than flipped — on #2a2520 the light
     end of the light ramp would glare, so the ramp is re-anchored and runs from
     a deep sienna up to the bright one. Both are monotone in lightness
     (relative luminance .726→.062 light, .062→.414 dark), which is the check a
     sequential ramp has to pass. */
  .step-1 {
    --fill: #fed7aa;
    --ink: #1e293b;
  }
  .step-2 {
    --fill: #fdba74;
    --ink: #1e293b;
  }
  .step-3 {
    --fill: #f97316;
    --ink: #1e293b;
  }
  .step-4 {
    --fill: #c2410c;
    --ink: #faf5eb;
  }
  .step-5 {
    --fill: #7c2d12;
    --ink: #faf5eb;
  }
  .is-dark .step-1 {
    --fill: #7c2d12;
    --ink: #faf5eb;
  }
  .is-dark .step-2 {
    --fill: #9a3412;
    --ink: #faf5eb;
  }
  .is-dark .step-3 {
    --fill: #c2410c;
    --ink: #faf5eb;
  }
  .is-dark .step-4 {
    --fill: #ea580c;
    --ink: #0f172a;
  }
  .is-dark .step-5 {
    --fill: #fb923c;
    --ink: #0f172a;
  }

  /* Not `.outline`: Tailwind ships a utility of that name, and an
     `outline-style: solid` on an SVG path draws a rectangle around its bounding
     box — which is precisely the stray frame around the country it produced. */
  .map-country {
    /* Drawn, not filled. A filled country covers the whole frame as soon as
       anyone zooms into it, and its rectangular edge then reads as two stray
       vertical lines down the sides of the map. */
    fill: none;
    stroke: rgb(30 41 59 / 0.3);
    stroke-width: 1;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .is-dark .map-country {
    stroke: rgb(250 245 235 / 0.28);
  }

  /* The administrative ladder, all three rungs in the same ink as the country
     and told apart by weight and by strike: the Bundesland heavier than the
     country it sits in — it is the one doing the orienting at that scale — and
     the Kreis lighter and dashed. Two channels rather than one, so the two
     levels stay distinguishable for a reader who cannot tell a 1.4 px line from
     a 0.8 px one, which on a high-density screen is most readers.

     Never filled, and drawn once: the artefact holds each border as an arc that
     belongs to exactly one level (see docu/karte.md), so no stretch of line is
     painted twice and no dash rides on top of a solid. */
  .map-state,
  .map-district,
  .state-names,
  .district-names {
    /* The staging is a ramp, but a click of the zoom button is a jump of 1.6 —
       wide enough to cross a whole band at once. The transition is what keeps
       that from reading as a layer switching on. */
    transition: opacity 250ms ease-out;
  }
  @media (prefers-reduced-motion: reduce) {
    .map-state,
    .map-district,
    .state-names,
    .district-names {
      transition: none;
    }
  }

  .map-state,
  .map-district {
    fill: none;
    stroke-linejoin: round;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }
  .map-state {
    stroke: rgb(30 41 59 / 0.45);
    stroke-width: 1.4;
  }
  .map-district {
    stroke: rgb(30 41 59 / 0.35);
    stroke-width: 0.8;
    stroke-dasharray: 4 2;
  }
  .is-dark .map-state {
    stroke: rgb(250 245 235 / 0.42);
  }
  .is-dark .map-district {
    stroke: rgb(250 245 235 / 0.32);
  }

  /* Set into the country rather than onto it: pale enough to read the map
     through, tracked out the way an area label is, and always under everything
     that carries a number. */
  .state-names text {
    fill: rgb(30 41 59 / 0.3);
    font-weight: 600;
    letter-spacing: 0.25em;
  }
  .is-dark .state-names text {
    fill: rgb(250 245 235 / 0.26);
  }

  /* The Kreis name is a label, not a wash: it wears a halo of the surface
     colour so it stays legible where it crosses a border or an area. */
  .district-names text {
    fill: rgb(30 41 59 / 0.66);
    font-weight: 600;
    paint-order: stroke;
    stroke: #faf5eb;
    stroke-width: 3;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .is-dark .district-names text {
    fill: rgb(250 245 235 / 0.66);
    stroke: #1a1714;
  }

  .areas path {
    fill: var(--fill);
    fill-rule: evenodd;
    /* Drawn in the step's own ink rather than in the surface colour. A hairline
       the colour of the page separates two neighbours only where there is page
       behind it — and three villages that share borders, all at the same count
       and therefore the same fill, ran together into one blob. The ink of a step
       is the colour its numbers were contrast-checked against, so the edge is
       legible on every step of the ramp and in both modes, without a second
       palette to keep in sync. */
    stroke: var(--ink);
    stroke-opacity: 0.55;
    stroke-width: 1.25;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    opacity: 0.85;
  }

  .dots circle {
    fill: var(--fill);
    stroke: #faf5eb;
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }
  .is-dark .dots circle {
    stroke: #2a2520;
  }

  .places circle {
    fill: rgb(30 41 59 / 0.45);
  }
  .places text {
    fill: rgb(30 41 59 / 0.72);
    paint-order: stroke;
    stroke: #faf5eb;
    stroke-width: 2.5;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .is-dark .places circle {
    fill: rgb(250 245 235 / 0.45);
  }
  .is-dark .places text {
    fill: rgb(250 245 235 / 0.72);
    stroke: #1a1714;
  }

  /* The number wears the ink its own fill was measured against — every pairing
     below clears 4.5:1, in both modes. No halo: it sits inside the dot, so
     there is nothing else for it to be read against. */
  .labels text {
    font-weight: 600;
    fill: var(--ink);
  }

  .map-button {
    display: flex;
    width: 1.75rem;
    height: 1.75rem;
    align-items: center;
    justify-content: center;
    border-radius: 0.25rem;
    border: 2px solid rgb(30 41 59 / 0.15);
    background: rgb(250 245 235 / 0.9);
    color: #1e293b;
    font-weight: 600;
    line-height: 1;
  }
  .map-button:hover {
    background: #faf5eb;
  }
  .is-dark .map-button {
    border-color: #3d3630;
    background: rgb(26 23 20 / 0.9);
    color: #faf5eb;
  }

  .swatch {
    display: inline-block;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 2px;
    background: var(--fill);
  }
</style>
