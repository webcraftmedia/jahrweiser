<script setup lang="ts">
  /**
   * A small multi-month line chart, hand-drawn as inline SVG.
   *
   * No charting library on purpose: the whole bundle is measured against a
   * 220 kB budget, and one dependency for two admin-only charts would eat a
   * third of the remaining headroom.
   *
   * Series colours live in this component's stylesheet rather than in a prop,
   * because each one needs a *chosen* dark-mode step, not an automatic flip —
   * the pair below was validated for colour-vision separation against both
   * surfaces (teal/orange, worst-case ΔE 13.7; green/orange collapses to 1.7
   * under deuteranopia and was rejected for that reason).
   */
  export type SeriesTone = 'members' | 'subscribed' | 'unsubscribed' | 'postal'

  export interface ChartSeries {
    tone: SeriesTone
    label: string
    /** null = not measured that month; the line starts where data starts. */
    values: (number | null)[]
  }

  const props = withDefaults(
    defineProps<{
      /** Short month labels, oldest first. */
      labels: string[]
      series: ChartSeries[]
      /**
       * Number of leading points that are derived rather than measured — drawn
       * dashed across every series, because they are an inference.
       */
      derivedCount?: number
      /** Accessible name; also the caption of the data table. */
      title: string
    }>(),
    { derivedCount: 0 },
  )

  // Geometry in viewBox units. The SVG scales with its container; strokes are
  // pinned with vector-effect so a wide card does not fatten the lines.
  const W = 320
  const H = 120
  // Room on the right for the endpoint labels — the axis carries the scale,
  // the label carries the number that actually gets read.
  const PAD = { top: 8, right: 34, bottom: 18, left: 30 }

  const maxValue = computed(() => {
    const values = props.series.flatMap((s) => s.values).filter((v): v is number => v !== null)
    // A flat zero series still needs a scale to draw against.
    return Math.max(1, ...values)
  })

  /**
   * The smallest clean number above the data. Rounding to the next power of
   * ten would put a curve around 117 into a 0–200 scale, where a year of
   * growth is a flat line; these steps keep the ceiling close to the data
   * while the labels stay numbers a person would say out loud.
   */
  const ceiling = computed(() => {
    const max = maxValue.value
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)))
    // One of these always matches: `magnitude` is the largest power of ten at
    // or below `max`, so `max` is always under ten times it.
    const factor = [1, 1.2, 1.6, 2, 2.4, 3.2, 4, 5, 6, 8, 10].find(
      (candidate) => magnitude * candidate >= max,
    )!
    const nice = magnitude * factor
    // Below ten, halving has to stay whole for the middle gridline.
    return nice < 10 ? Math.ceil(nice / 2) * 2 : nice
  })

  function x(index: number): number {
    const span = W - PAD.left - PAD.right
    if (props.labels.length <= 1) return PAD.left + span / 2
    return PAD.left + (index * span) / (props.labels.length - 1)
  }

  function y(value: number): number {
    const span = H - PAD.top - PAD.bottom
    return H - PAD.bottom - (value / ceiling.value) * span
  }

  /** `M…L…` over the points that have a value, skipping the leading nulls. */
  function pathFor(values: (number | null)[], from = 0, to = values.length): string {
    const points: string[] = []
    for (let index = from; index < to; index += 1) {
      const value = values[index]
      if (value === null || value === undefined) {
        continue
      }
      points.push(`${points.length === 0 ? 'M' : 'L'}${x(index)} ${y(value)}`)
    }
    return points.join(' ')
  }

  /**
   * The derived span of each series, dashed, overlapping the measured path by
   * one point so the two meet without a gap.
   */
  const derivedPaths = computed(() =>
    props.derivedCount > 0
      ? props.series.map((entry) => ({
          tone: entry.tone,
          d: pathFor(entry.values, 0, Math.min(props.derivedCount + 1, props.labels.length)),
        }))
      : [],
  )

  const measuredPaths = computed(() =>
    props.series.map((entry) => ({
      tone: entry.tone,
      d: pathFor(entry.values, Math.max(0, props.derivedCount)),
    })),
  )

  const gridLines = computed(() => [0, ceiling.value / 2, ceiling.value])

  /** -1 = nothing hovered. An index rather than null keeps the lookups plain. */
  const hovered = ref(-1)

  /** What a series shows at the hovered month; null when it was not measured. */
  function hoveredValue(entry: ChartSeries): number | null {
    return entry.values[hovered.value] ?? null
  }

  /**
   * The last measured point of each series, for the direct label. Selective by
   * design: a number on every point is chaos, the endpoint is the one people
   * look for.
   */
  const endpoints = computed(() =>
    props.series
      .map((entry) => {
        const index = entry.values.findLastIndex((value) => value !== null)
        return index === -1 ? null : { tone: entry.tone, index, value: entry.values[index]! }
      })
      .filter((entry) => entry !== null),
  )

  function columnWidth(): number {
    return (W - PAD.left - PAD.right) / Math.max(1, props.labels.length - 1)
  }
</script>

<template>
  <figure class="m-0">
    <div class="relative">
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        class="w-full h-auto"
        role="img"
        :aria-label="title"
        @mouseleave="hovered = -1"
      >
        <!-- Grid and axis text stay recessive; they orient, they do not compete. -->
        <g class="grid">
          <line
            v-for="value in gridLines"
            :key="value"
            :x1="PAD.left"
            :x2="W - PAD.right"
            :y1="y(value)"
            :y2="y(value)"
          />
        </g>
        <g class="axis-text">
          <text
            v-for="value in gridLines"
            :key="value"
            :x="PAD.left - 5"
            :y="y(value) + 3"
            text-anchor="end"
          >
            {{ value }}
          </text>
          <text
            v-for="(label, index) in labels"
            v-show="
              index === 0 || index === labels.length - 1 || index === Math.floor(labels.length / 2)
            "
            :key="label"
            :x="x(index)"
            :y="H - 5"
            :text-anchor="index === 0 ? 'start' : index === labels.length - 1 ? 'end' : 'middle'"
          >
            {{ label }}
          </text>
        </g>

        <!-- Crosshair under the marks, so it never hides a data point. -->
        <line
          v-if="hovered >= 0"
          class="crosshair"
          :x1="x(hovered)"
          :x2="x(hovered)"
          :y1="PAD.top"
          :y2="H - PAD.bottom"
        />

        <path
          v-for="entry in derivedPaths"
          :key="`derived-${entry.tone}`"
          class="series line series-derived"
          :class="`tone-${entry.tone}`"
          :d="entry.d"
        />
        <path
          v-for="entry in measuredPaths"
          :key="entry.tone"
          class="series line"
          :class="`tone-${entry.tone}`"
          :d="entry.d"
        />

        <template v-if="hovered >= 0">
          <circle
            v-for="entry in series"
            v-show="hoveredValue(entry) !== null"
            :key="entry.tone"
            class="marker"
            :class="`tone-${entry.tone}`"
            :cx="x(hovered)"
            :cy="y(hoveredValue(entry) ?? 0)"
            r="4"
          />
        </template>

        <!-- The endpoint dot carries the series colour; the number beside it
             wears ink, so identity never rests on the text. -->
        <g class="endpoints">
          <circle
            v-for="entry in endpoints"
            :key="`dot-${entry.tone}`"
            class="marker"
            :class="`tone-${entry.tone}`"
            :cx="x(entry.index)"
            :cy="y(entry.value)"
            r="2.5"
          />
          <text
            v-for="entry in endpoints"
            :key="`label-${entry.tone}`"
            :x="x(entry.index) + 5"
            :y="y(entry.value) + 2.5"
          >
            {{ entry.value }}
          </text>
        </g>

        <!-- Hit targets are a whole column wide, far bigger than the marks. -->
        <rect
          v-for="(label, index) in labels"
          :key="`hit-${label}`"
          :x="x(index) - columnWidth() / 2"
          :y="PAD.top"
          :width="columnWidth()"
          :height="H - PAD.top - PAD.bottom"
          fill="transparent"
          @mouseenter="hovered = index"
        />
      </svg>

      <div
        v-if="hovered >= 0"
        class="pointer-events-none absolute top-0 z-10 rounded border-2 border-navy/15 dark:border-poster-darkBorder bg-ivory dark:bg-poster-dark px-2 py-1 text-xs font-body shadow-lg"
        :style="{
          left: `${(x(hovered) / W) * 100}%`,
          transform: hovered > labels.length / 2 ? 'translateX(-100%)' : 'none',
        }"
        role="status"
      >
        <div class="font-medium text-navy dark:text-ivory">{{ labels[hovered] }}</div>
        <!-- eslint-disable @intlify/vue-i18n/no-raw-text -- Doppelpunkt und
             Gedankenstrich sind Interpunktion bzw. Platzhalter, keine Texte -->
        <div v-for="entry in series" :key="entry.tone" class="flex items-center gap-1.5">
          <span class="swatch" :class="`tone-${entry.tone}`" aria-hidden="true" />
          <span class="text-navy/70 dark:text-ivory/70">
            {{ entry.label }}: {{ hoveredValue(entry) === null ? '—' : hoveredValue(entry) }}
          </span>
        </div>
        <!-- eslint-enable @intlify/vue-i18n/no-raw-text -->
      </div>
    </div>

    <!-- A legend only where identity would otherwise rest on colour alone. -->
    <figcaption v-if="series.length > 1" class="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      <span
        v-for="entry in series"
        :key="entry.tone"
        class="flex items-center gap-1.5 text-xs font-body text-navy/70 dark:text-ivory/70"
      >
        <span class="swatch" :class="`tone-${entry.tone}`" aria-hidden="true" />
        {{ entry.label }}
      </span>
    </figcaption>

    <!-- The same numbers, reachable without seeing the chart. -->
    <table class="sr-only">
      <caption>
        {{
          title
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col">{{ $t('pages.admin.dashboard.chart.month') }}</th>
          <th v-for="entry in series" :key="entry.tone" scope="col">{{ entry.label }}</th>
        </tr>
      </thead>
      <!-- eslint-disable @intlify/vue-i18n/no-raw-text -- Gedankenstrich als
           Platzhalter fuer einen nicht gemessenen Monat, kein Text -->
      <tbody>
        <tr v-for="(label, index) in labels" :key="label">
          <th scope="row">{{ label }}</th>
          <td v-for="entry in series" :key="entry.tone">
            {{ entry.values[index] === null ? '—' : entry.values[index] }}
          </td>
        </tr>
      </tbody>
      <!-- eslint-enable @intlify/vue-i18n/no-raw-text -->
    </table>
  </figure>
</template>

<style scoped>
  /* Validated against both surfaces with the dataviz palette checker: worst
     adjacent CVD ΔE 13.7 (light) / 13.8 (dark), normal-vision ΔE 27+. The dark
     steps are chosen, not derived — teal holds, only the orange lightens. */
  .tone-members {
    --series: #c2410c;
  }
  .tone-subscribed {
    --series: #0d9488;
  }
  .tone-unsubscribed {
    --series: #c2410c;
  }
  /* Same teal as `subscribed`: it is drawn against the same orange, and that
     pair is the one that survived the CVD check. */
  .tone-postal {
    --series: #0d9488;
  }
  :global(.dark) .tone-members,
  :global(.dark) .tone-unsubscribed {
    --series: #ea580c;
  }

  .line {
    fill: none;
    stroke: var(--series);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  /* Dashed = inferred from join dates, not measured. */
  .series-derived {
    stroke-dasharray: 3 3;
    opacity: 0.75;
  }
  .marker {
    fill: var(--series);
    stroke: var(--surface-ring, #faf5eb);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }
  :global(.dark) .marker {
    stroke: #2a2520;
  }

  .swatch {
    display: inline-block;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 2px;
    background: var(--series);
  }

  .grid line {
    stroke: rgb(30 41 59 / 0.12);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  :global(.dark) .grid line {
    stroke: rgb(250 245 235 / 0.14);
  }
  .crosshair {
    stroke: rgb(30 41 59 / 0.25);
    stroke-width: 1;
    stroke-dasharray: 2 2;
    vector-effect: non-scaling-stroke;
  }
  :global(.dark) .crosshair {
    stroke: rgb(250 245 235 / 0.3);
  }

  .axis-text text {
    font-size: 7px;
    fill: rgb(30 41 59 / 0.6);
  }
  :global(.dark) .axis-text text {
    fill: rgb(250 245 235 / 0.6);
  }

  .endpoints text {
    font-size: 8px;
    font-weight: 600;
    fill: rgb(30 41 59 / 0.85);
  }
  :global(.dark) .endpoints text {
    fill: rgb(250 245 235 / 0.85);
  }
</style>
