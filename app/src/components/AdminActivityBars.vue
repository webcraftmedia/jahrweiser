<script setup lang="ts">
  /**
   * Current members by how long ago they were last active, as horizontal bars.
   *
   * HTML rather than SVG: six labelled rows need no coordinate system, and the
   * labels wrap and scale with the text like the rest of the page. Every bar
   * carries its count and share as a direct label, so there is nothing a hover
   * could add — six numbers fit, and they are the point of the chart.
   *
   * One hue for the recency spans, ordered from fresh to stale; "never logged
   * in" is not a point on that scale, so it is drawn neutral rather than as
   * one more step of it.
   */
  import type { ActivityBucket, ActivityCounts } from '~~/shared/activity'

  import { ACTIVITY_BUCKETS } from '~~/shared/activity'

  const props = defineProps<{
    counts: ActivityCounts
    /** Accessible name; also the caption of the data table. */
    title: string
  }>()

  const label = useActivityLabel()

  const total = computed(() => ACTIVITY_BUCKETS.reduce((sum, key) => sum + props.counts[key], 0))
  const max = computed(() => Math.max(1, ...ACTIVITY_BUCKETS.map((key) => props.counts[key])))

  /** Share of all members, whole percent — a tenth would be false precision. */
  function share(key: ActivityBucket): number {
    return total.value === 0 ? 0 : Math.round((props.counts[key] / total.value) * 100)
  }

  const rows = computed(() =>
    ACTIVITY_BUCKETS.map((key) => ({
      key,
      label: label(key),
      count: props.counts[key],
      share: share(key),
      width: (props.counts[key] / max.value) * 100,
    })),
  )
</script>

<template>
  <figure class="m-0">
    <div class="space-y-2" role="img" :aria-label="title">
      <div
        v-for="row in rows"
        :key="row.key"
        class="grid grid-cols-[7.5rem_1fr] items-center gap-3 text-xs font-body sm:grid-cols-[9rem_1fr]"
      >
        <span class="text-navy/70 dark:text-ivory/70">{{ row.label }}</span>
        <div class="flex items-center gap-2">
          <!-- An empty span still gets its row and its zero: a missing bar
               would read as "not measured". -->
          <span
            class="bar h-3"
            :class="row.key === 'never' ? 'bar-neutral' : 'bar-recency'"
            :style="{ width: `${row.width}%` }"
            aria-hidden="true"
          />
          <!-- eslint-disable @intlify/vue-i18n/no-raw-text -- Mittelpunkt und
               Prozentzeichen sind Interpunktion bzw. Einheit, keine Texte -->
          <span class="whitespace-nowrap font-medium text-navy/85 dark:text-ivory/85">
            {{ row.count }} · {{ row.share }} %
          </span>
          <!-- eslint-enable @intlify/vue-i18n/no-raw-text -->
        </div>
      </div>
    </div>

    <!-- The same numbers, reachable without seeing the chart. -->
    <table class="sr-only">
      <caption>
        {{
          title
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col">{{ $t('pages.admin.dashboard.activity.span') }}</th>
          <th scope="col">{{ $t('pages.admin.dashboard.tile.members') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.key">
          <th scope="row">{{ row.label }}</th>
          <td>{{ row.count }}</td>
        </tr>
      </tbody>
    </table>
  </figure>
</template>

<style scoped>
  .bar {
    display: block;
    /* A zero still shows where the bar would start. */
    min-width: 2px;
    /* Rounded at the data end only; the baseline end stays square. */
    border-radius: 0 4px 4px 0;
  }
  /* The teal of the trend charts — the colour of "members doing something". */
  .bar-recency {
    background: #0d9488;
  }
  .bar-neutral {
    background: rgb(30 41 59 / 0.3);
  }
  .dark .bar-neutral {
    background: rgb(250 245 235 / 0.3);
  }
</style>
