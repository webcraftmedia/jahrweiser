<script setup lang="ts">
  import type { ActivityCounts } from '~~/shared/activity'
  import type { ChartSeries } from '~~/src/components/AdminTrendChart.vue'

  definePageMeta({
    middleware: ['authenticated', 'admin'],
  })

  // The client with the 401 handling — see useApi().
  const api = useApi()
  interface MetricsMonth {
    month: string
    members: number
    derived: boolean
    newsletterSubscribed: number
    newsletterUnsubscribed: number
    /** null = not measured that month; see the server-side type. */
    withPostalCode: number | null
    /** null = not measured that month; there is no reconstruction. */
    active30d: number | null
  }

  interface MetricsResponse {
    current: {
      members: number
      newsletterSubscribed: number
      newsletterUnsubscribed: number
      telegramChannels: number
      blaettchenIssues: number
      withPostalCode: number
    }
    months: MetricsMonth[]
    activity: ActivityCounts
  }

  const { t, locale } = useI18n()

  /** An empty reading, so nothing downstream has to ask whether data arrived —
      the loading and error states are what the template branches on. */
  const EMPTY: MetricsResponse = {
    current: {
      members: 0,
      newsletterSubscribed: 0,
      newsletterUnsubscribed: 0,
      telegramChannels: 0,
      blaettchenIssues: 0,
      withPostalCode: 0,
    },
    months: [],
    activity: { day: 0, week: 0, month: 0, quarter: 0, older: 0, never: 0 },
  }

  const metrics = ref<MetricsResponse>(EMPTY)
  const isLoading = ref(true)
  const loadError = ref(false)

  async function load(): Promise<void> {
    isLoading.value = true
    loadError.value = false
    try {
      metrics.value = await api<MetricsResponse>('/api/admin/metrics')
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner api()-Aufruf: Fehler wird geloggt und als Statusmeldung angezeigt
    } catch (error) {
      console.error(error)
      loadError.value = true
    } finally {
      isLoading.value = false
    }
  }

  onMounted(load)

  /**
   * `load()` for an admin coming back to a dashboard left open in the
   * background (see useRefreshable). Keeps the tiles and charts on screen
   * while it asks — `load()` would swap them for the loading state and drop
   * the scroll position with them — and keeps them when the answer does not
   * come; an error message replaces nothing that is still worth reading.
   */
  async function refresh(): Promise<void> {
    if (isLoading.value) return
    if (loadError.value) return load()
    try {
      metrics.value = await api<MetricsResponse>('/api/admin/metrics')
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner api()-Aufruf: geloggt, das Dashboard zeigt weiter den letzten Stand
    } catch (error) {
      console.error(error)
    }
  }

  useRefreshable(refresh)

  /** `2026-09` → `Sep 26`, short enough for an axis label. */
  function monthLabel(month: string): string {
    const [year, index] = month.split('-').map(Number) as [number, number]
    return new Date(Date.UTC(year, index - 1, 1)).toLocaleDateString(locale.value, {
      month: 'short',
      year: '2-digit',
      timeZone: 'UTC',
    })
  }

  const labels = computed(() => metrics.value.months.map((m) => monthLabel(m.month)))

  /**
   * Members and, against them, how many of them the map can place. The gap
   * between the two lines is the open address work — which is the whole reason
   * the second series sits in this chart rather than in one of its own.
   */
  const memberSeries = computed<ChartSeries[]>(() => [
    {
      tone: 'members',
      label: t('pages.admin.dashboard.tile.members'),
      values: metrics.value.months.map((m) => m.members),
    },
    {
      tone: 'postal',
      label: t('pages.admin.dashboard.tile.plz'),
      values: metrics.value.months.map((m) => m.withPostalCode),
    },
  ])

  const newsletterSeries = computed<ChartSeries[]>(() => [
    {
      tone: 'subscribed',
      label: t('pages.admin.dashboard.tile.subscribed'),
      values: metrics.value.months.map((m) => m.newsletterSubscribed),
    },
    {
      tone: 'unsubscribed',
      label: t('pages.admin.dashboard.tile.unsubscribed'),
      values: metrics.value.months.map((m) => m.newsletterUnsubscribed),
    },
  ])

  /**
   * Members and, against them, how many were active in the 30 days before
   * each month ended. Same unit, a subset, one axis — the gap is the part of
   * the membership that was quiet that month.
   */
  const activitySeries = computed<ChartSeries[]>(() => [
    {
      tone: 'members',
      label: t('pages.admin.dashboard.tile.members'),
      values: metrics.value.months.map((m) => m.members),
    },
    {
      tone: 'active',
      label: t('pages.admin.dashboard.activity.active30d'),
      values: metrics.value.months.map((m) => m.active30d),
    },
  ])

  /**
   * How many leading months are inferred rather than measured. They are the
   * leading ones by construction: measuring started on some day and never
   * stopped.
   */
  const derivedCount = computed(() => {
    const months = metrics.value.months
    const firstMeasured = months.findIndex((month) => !month.derived)
    return firstMeasured === -1 ? months.length : firstMeasured
  })

  /**
   * Whether the postal-code line starts later than the chart does — i.e. there
   * are months in the window that predate the measurement. The note explaining
   * the gap is worth showing exactly then.
   */
  const postalStartsLate = computed(() => {
    const months = metrics.value.months
    return months.length > 0 && months[0]!.withPostalCode === null
  })

  /** Same as `postalStartsLate`, for the activity line. */
  const activityStartsLate = computed(() => {
    const months = metrics.value.months
    return months.length > 0 && months[0]!.active30d === null
  })

  const tiles = computed(() => [
    { key: 'members', value: metrics.value.current.members },
    { key: 'plz', value: metrics.value.current.withPostalCode },
    { key: 'subscribed', value: metrics.value.current.newsletterSubscribed },
    { key: 'unsubscribed', value: metrics.value.current.newsletterUnsubscribed },
    { key: 'telegram', value: metrics.value.current.telegramChannels },
    { key: 'blaettchen', value: metrics.value.current.blaettchenIssues },
  ])

  function tileLabel(key: string): string {
    return {
      members: t('pages.admin.dashboard.tile.members'),
      plz: t('pages.admin.dashboard.tile.plz'),
      subscribed: t('pages.admin.dashboard.tile.subscribed'),
      unsubscribed: t('pages.admin.dashboard.tile.unsubscribed'),
      telegram: t('pages.admin.dashboard.tile.telegram'),
      blaettchen: t('pages.admin.dashboard.tile.blaettchen'),
    }[key]!
  }

  const cardClass =
    'animate-fade-slide-up bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder'
</script>

<template>
  <div class="space-y-6">
    <h1 class="hidden md:block text-2xl font-display text-navy dark:text-ivory">
      {{ $t('pages.admin.dashboard.title') }}
    </h1>

    <div v-if="isLoading" class="flex items-center justify-center gap-2 py-12">
      <LoadingDots />
    </div>
    <p
      v-else-if="loadError"
      role="alert"
      :class="[cardClass, 'text-sm font-body text-sienna dark:text-sienna-light']"
    >
      {{ $t('pages.admin.dashboard.error') }}
    </p>

    <template v-else>
      <!-- The six current numbers. No chart where a chart would only decorate
           a single-digit figure. -->
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div v-for="tile in tiles" :key="tile.key" :class="[cardClass, 'p-4']">
          <p class="text-xs font-body text-navy/60 dark:text-poster-darkMuted">
            {{ tileLabel(tile.key) }}
          </p>
          <p class="mt-1 text-3xl font-display text-navy dark:text-ivory">{{ tile.value }}</p>
        </div>
      </div>

      <div :class="cardClass">
        <h2 class="text-lg font-display text-navy dark:text-ivory mb-4">
          {{ $t('pages.admin.dashboard.chart.members') }}
        </h2>
        <AdminTrendChart
          :labels="labels"
          :series="memberSeries"
          :derived-count="derivedCount"
          :title="$t('pages.admin.dashboard.chart.members')"
        />
        <p
          v-if="derivedCount > 0"
          class="mt-3 text-xs font-body text-navy/60 dark:text-poster-darkMuted"
        >
          {{ $t('pages.admin.dashboard.chart.derived-note') }}
        </p>
        <p
          v-if="postalStartsLate"
          class="mt-2 text-xs font-body text-navy/60 dark:text-poster-darkMuted"
        >
          {{ $t('pages.admin.dashboard.chart.plz-note') }}
        </p>
      </div>

      <div :class="cardClass">
        <h2 class="text-lg font-display text-navy dark:text-ivory mb-4">
          {{ $t('pages.admin.dashboard.activity.title') }}
        </h2>
        <AdminActivityBars
          :counts="metrics.activity"
          :title="$t('pages.admin.dashboard.activity.title')"
        />
        <p class="mt-3 text-xs font-body text-navy/60 dark:text-poster-darkMuted">
          {{ $t('pages.admin.dashboard.activity.note') }}
        </p>

        <h3 class="text-base font-display text-navy dark:text-ivory mt-6 mb-4">
          {{ $t('pages.admin.dashboard.activity.trend') }}
        </h3>
        <AdminTrendChart
          :labels="labels"
          :series="activitySeries"
          :derived-count="derivedCount"
          :title="$t('pages.admin.dashboard.activity.trend')"
        />
        <p
          v-if="activityStartsLate"
          class="mt-3 text-xs font-body text-navy/60 dark:text-poster-darkMuted"
        >
          {{ $t('pages.admin.dashboard.activity.trend-note') }}
        </p>
      </div>

      <div :class="cardClass">
        <h2 class="text-lg font-display text-navy dark:text-ivory mb-4">
          {{ $t('pages.admin.dashboard.chart.newsletter') }}
        </h2>
        <AdminTrendChart
          :labels="labels"
          :series="newsletterSeries"
          :derived-count="derivedCount"
          :title="$t('pages.admin.dashboard.chart.newsletter')"
        />
        <p
          v-if="derivedCount > 0"
          class="mt-3 text-xs font-body text-navy/60 dark:text-poster-darkMuted"
        >
          {{ $t('pages.admin.dashboard.chart.newsletter-derived-note') }}
        </p>
      </div>
    </template>
  </div>
</template>
