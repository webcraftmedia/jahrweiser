<script setup lang="ts">
  import type { ChartSeries } from '~~/src/components/AdminTrendChart.vue'

  definePageMeta({
    middleware: ['authenticated', 'admin'],
  })

  interface MetricsMonth {
    month: string
    members: number
    derived: boolean
    newsletterSubscribed: number | null
    newsletterUnsubscribed: number | null
  }

  interface MetricsResponse {
    current: {
      members: number
      newsletterSubscribed: number
      newsletterUnsubscribed: number
      telegramChannels: number
      blaettchenIssues: number
    }
    months: MetricsMonth[]
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
    },
    months: [],
  }

  const metrics = ref<MetricsResponse>(EMPTY)
  const isLoading = ref(true)
  const loadError = ref(false)

  async function load(): Promise<void> {
    isLoading.value = true
    loadError.value = false
    try {
      metrics.value = await $fetch<MetricsResponse>('/api/admin/metrics')
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner $fetch: Fehler wird geloggt und als Statusmeldung angezeigt
    } catch (error) {
      console.error(error)
      loadError.value = true
    } finally {
      isLoading.value = false
    }
  }

  onMounted(load)

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

  const memberSeries = computed<ChartSeries[]>(() => [
    {
      tone: 'members',
      label: t('pages.admin.dashboard.tile.members'),
      values: metrics.value.months.map((m) => m.members),
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
   * How many leading months are inferred rather than measured. They are the
   * leading ones by construction: measuring started on some day and never
   * stopped.
   */
  const derivedCount = computed(() => {
    const months = metrics.value.months
    const firstMeasured = months.findIndex((month) => !month.derived)
    return firstMeasured === -1 ? months.length : firstMeasured
  })

  /** True while no month carries a newsletter measurement yet. */
  const newsletterPending = computed(() =>
    metrics.value.months.every((month) => month.newsletterSubscribed === null),
  )

  const tiles = computed(() => [
    { key: 'members', value: metrics.value.current.members },
    { key: 'subscribed', value: metrics.value.current.newsletterSubscribed },
    { key: 'unsubscribed', value: metrics.value.current.newsletterUnsubscribed },
    { key: 'telegram', value: metrics.value.current.telegramChannels },
    { key: 'blaettchen', value: metrics.value.current.blaettchenIssues },
  ])

  function tileLabel(key: string): string {
    return {
      members: t('pages.admin.dashboard.tile.members'),
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
      <!-- The five current numbers. No chart where a chart would only decorate
           a single-digit figure. -->
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
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
      </div>

      <div :class="cardClass">
        <h2 class="text-lg font-display text-navy dark:text-ivory mb-4">
          {{ $t('pages.admin.dashboard.chart.newsletter') }}
        </h2>
        <p
          v-if="newsletterPending"
          class="text-sm font-body text-navy/60 dark:text-poster-darkMuted"
        >
          {{ $t('pages.admin.dashboard.chart.newsletter-pending') }}
        </p>
        <AdminTrendChart
          v-else
          :labels="labels"
          :series="newsletterSeries"
          :title="$t('pages.admin.dashboard.chart.newsletter')"
        />
      </div>
    </template>
  </div>
</template>
