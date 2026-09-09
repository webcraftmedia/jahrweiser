<script setup lang="ts">
  import type { MapArea, MapOutline, MapPlace } from '~~/shared/map'

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
     * A preview with made-up numbers, shown blurred to members who have not
     * given their own postal code. Skips the tooltip, the controls and the data
     * table: there is nothing behind it to look at more closely.
     */
    decorative?: boolean
    /** Accessible name; also the caption of the data table. */
    title: string
  }>()

  /**
   * The rectangle now on screen, so whoever owns the data can fetch the place
   * names for it. Debounced — a drag would otherwise emit on every frame.
   */
  const emit = defineEmits<{
    viewport: [{ minX: number; minY: number; maxX: number; maxY: number }]
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
   * of a village a postal code ends on, and about where the simplification the
   * geometry was built with starts to show.
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
    if (typeof ResizeObserver === 'undefined' || !svg.value) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect && rect.width > 0 && rect.height > 0) {
        frame.value = { width: rect.width, height: rect.height }
      }
    })
    observer.observe(svg.value)
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

  const unitsPerPixel = (): number => unit.value

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

  /** Where a pointer event lands, in viewBox units. */
  function pointAt(event: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = svg.value?.getBoundingClientRect()
    const perPixel = unitsPerPixel()
    const h = view.value.w * (full.value.height / full.value.width)
    // The drawing is centred in the box; the letterbox margins are the rest.
    const marginX = ((rect?.width ?? 0) - view.value.w / perPixel) / 2
    const marginY = ((rect?.height ?? 0) - h / perPixel) / 2
    return {
      x:
        view.value.cx - view.value.w / 2 + (event.clientX - (rect?.left ?? 0) - marginX) * perPixel,
      y: view.value.cy - h / 2 + (event.clientY - (rect?.top ?? 0) - marginY) * perPixel,
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
    const perPixel = unitsPerPixel()
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

  /** Place names are context, so they are set smaller than the numbers. */
  const placeFontSize = computed(() => 10.5 * unit.value)

  /** Beyond this the map is a wall of names and no longer a map. */
  const MAX_PLACE_LABELS = 70

  interface Rect {
    x: number
    y: number
    w: number
    h: number
  }

  const overlaps = (a: Rect, b: Rect): boolean =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

  interface PlacedLabel {
    place: MapPlace
    x: number
    y: number
    anchor: 'middle' | 'start' | 'end'
    rect: Rect
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
   * The order is the priority: the member dots hold their ground, their numbers
   * come next, and place names take what is left. Everything is measured in map
   * units at the current zoom — and since the type keeps its size on screen, it
   * *shrinks* in map units as the map grows, which is what makes a village's
   * name appear as soon as somebody zooms in far enough for it to fit.
   */
  const layout = computed(() => {
    const size = fontSize.value
    const placeSize = placeFontSize.value

    // The dots are placed by the data, not by this; they only block.
    const blocked: Rect[] = props.areas.map((area) => {
      const r = radius(area.count)
      return { x: area.cx - r, y: area.cy - r, w: 2 * r, h: 2 * r }
    })

    // Digits are narrower than the em they sit in; 0.62 is close enough for a
    // box that only has to decide whether two labels touch.
    const counts: MapArea[] = []
    const countBoxes: Rect[] = []
    for (const area of [...props.areas].sort((a, b) => b.count - a.count)) {
      const width = size * (0.62 * String(area.count).length + 0.5)
      const rect = { x: area.cx - width / 2, y: area.cy - size * 0.6, w: width, h: size * 1.2 }
      if (countBoxes.some((other) => overlaps(rect, other))) continue
      countBoxes.push(rect)
      counts.push(area)
    }

    // Only what is on screen may take up space; an off-screen village must not
    // spend a slot a visible one could have had.
    const half = visible.value.w / 2
    const halfHeight = visible.value.h / 2
    const taken = [...blocked, ...countBoxes]
    const places: PlacedLabel[] = []
    for (const place of props.places ?? []) {
      if (Math.abs(place.x - view.value.cx) > half) continue
      if (Math.abs(place.y - view.value.cy) > halfHeight) continue
      const label = placeLabel(place, placeSize, taken)
      if (!label) continue
      taken.push(label.rect)
      places.push(label)
      if (places.length >= MAX_PLACE_LABELS) break
    }

    return { counts, places }
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
        })
      }, 250)
    },
    { immediate: true },
  )
  onBeforeUnmount(() => {
    clearTimeout(viewportTimer)
  })

  /** The two numbers that label the ramp where the classes have no room. */
  const legendEnds = computed(() => ({
    from: String(legend.value[0]?.from ?? 1),
    to: `${legend.value[legend.value.length - 1]?.from ?? 1}+`,
  }))

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

        <g class="areas">
          <path
            v-for="area in painted"
            :key="area.plz"
            :class="`step-${stepFor(area.count)}`"
            :d="area.d"
          />
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
            v-for="area in painted"
            :key="area.plz"
            :class="`step-${stepFor(area.count)}`"
            :cx="area.cx"
            :cy="area.cy"
            :r="radius(area.count)"
          />
        </g>

        <!-- The number wears ink with a halo of the surface colour, so it stays
             readable over any step of the ramp without a box around it. -->
        <g class="labels" :style="{ fontSize: `${fontSize}px` }" aria-hidden="true">
          <text
            v-for="area in layout.counts"
            :key="area.plz"
            :class="`step-${stepFor(area.count)}`"
            :x="area.cx"
            :y="area.cy"
            text-anchor="middle"
            dominant-baseline="central"
          >
            {{ area.count }}
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

  .areas path {
    fill: var(--fill);
    fill-rule: evenodd;
    /* A hairline in the surface colour keeps two neighbouring areas apart —
       the 2 px gap a stacked mark would get, at map scale. */
    stroke: #faf5eb;
    stroke-width: 1;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    opacity: 0.85;
  }
  .is-dark .areas path {
    stroke: #2a2520;
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
