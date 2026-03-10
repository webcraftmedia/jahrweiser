<template>
  <div class="box">
    <div class="calendar row">
      <client-only>
        <div
          ref="calWrapper"
          class="cal-wrapper"
          @touchstart.passive="onTouchStart"
          @touchend.passive="onTouchEnd"
        >
          <ScheduleXCalendar v-if="calendarApp" :calendar-app="calendarApp">
            <template #headerContent>
              <div class="cv-header">
                <span class="periodLabel">{{ currentPeriodLabel }}</span>
                <div class="cv-header-nav">
                  <!-- eslint-disable @intlify/vue-i18n/no-raw-text -->
                  <button @click="navigatePeriod(-1)">
                    <span class="nav-arrow">‹</span
                    ><span class="nav-label"> {{ prevMonthLabel }}</span>
                  </button>
                  <!-- eslint-enable @intlify/vue-i18n/no-raw-text -->
                  <button :disabled="isCurrentMonth" @click="navigateToToday()">
                    {{ $t('pages.index.today') }}
                  </button>
                  <!-- eslint-disable @intlify/vue-i18n/no-raw-text -->
                  <button @click="navigatePeriod(1)">
                    <span class="nav-label">{{ nextMonthLabel }} </span
                    ><span class="nav-arrow">›</span>
                  </button>
                  <!-- eslint-enable @intlify/vue-i18n/no-raw-text -->
                </div>
              </div>
            </template>
          </ScheduleXCalendar>
          <!-- Loading overlay -->
          <div v-show="calLoading" class="cal-loading-overlay">
            <div class="flex items-center gap-2">
              <span class="loading-dot" />
              <span class="loading-dot" style="animation-delay: 0.15s" />
              <span class="loading-dot" style="animation-delay: 0.3s" />
            </div>
          </div>
          <!-- Calendar legend / filter -->
          <div
            class="cal-legend"
            :class="{
              'cal-legend-active': hiddenCalendars.size > 0,
              'cal-legend-open': legendHover,
            }"
          >
            <div class="cal-legend-inner">
              <button
                v-for="cal in calendarLegend"
                :key="cal.name"
                class="cal-legend-item"
                :class="{ 'cal-legend-hidden': hiddenCalendars.has(cal.name) }"
                @click="
                  toggleCalendar(cal.name)
                  ;($event.currentTarget as HTMLElement).blur()
                "
              >
                <span class="cal-legend-dot" :style="{ backgroundColor: cal.dotColor }" />
                <span class="cal-legend-name">{{ cal.name }}</span>
              </button>
            </div>
          </div>
        </div>
      </client-only>
      <Modal ref="modal" @x="handleModalX">
        <template #title>
          {{ eventTitle }}
        </template>

        <template #content>
          <!-- Loading dots -->
          <div v-if="eventLoading" class="flex justify-center items-center gap-2 py-4">
            <span class="loading-dot" />
            <span class="loading-dot" style="animation-delay: 0.15s" />
            <span class="loading-dot" style="animation-delay: 0.3s" />
          </div>
          <!-- Event content — rolls down when loaded -->
          <div v-else class="modal-content-reveal">
            <div class="modal-content-inner">
              <table class="text-left align-top text-navy dark:text-ivory font-body w-full">
                <tbody>
                  <tr class="border-b border-navy/8 dark:border-poster-darkBorder/50">
                    <th
                      class="pr-4 py-1.5 font-semibold text-navy/60 dark:text-ivory/60 whitespace-nowrap"
                    >
                      {{ $t('pages.index.details.start') }}
                    </th>
                    <td class="py-1.5">{{ eventStartDate }}</td>
                  </tr>
                  <tr class="border-b border-navy/8 dark:border-poster-darkBorder/50">
                    <th
                      class="pr-4 py-1.5 font-semibold text-navy/60 dark:text-ivory/60 whitespace-nowrap"
                    >
                      {{ $t('pages.index.details.duration') }}
                    </th>
                    <td class="py-1.5">{{ eventDuration }}</td>
                  </tr>
                  <tr v-show="eventLocation">
                    <th
                      class="pr-4 py-1.5 font-semibold text-navy/60 dark:text-ivory/60 whitespace-nowrap"
                    >
                      {{ $t('pages.index.details.location') }}
                    </th>
                    <td class="py-1.5">{{ eventLocation }}</td>
                  </tr>
                  <tr v-show="eventUrl">
                    <th
                      class="pr-4 py-1.5 font-semibold text-navy/60 dark:text-ivory/60 whitespace-nowrap"
                    >
                      {{ $t('pages.index.details.url') }}
                    </th>
                    <td class="py-1.5">
                      <a
                        :href="eventUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-orange-700 dark:text-orange-400 underline break-all"
                        >{{ eventUrl }}</a
                      >
                    </td>
                  </tr>
                </tbody>
              </table>
              <div
                v-show="eventDescription"
                class="mt-3 pt-3 border-t border-navy/10 dark:border-poster-darkBorder"
              >
                <pre
                  class="text-left whitespace-pre-wrap text-navy/80 dark:text-ivory/80 font-body leading-relaxed"
                  >{{ eventDescription }}</pre
                >
              </div>
            </div>
          </div>
        </template>
      </Modal>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ScheduleXCalendar } from '@schedule-x/vue'
  import {
    createCalendar,
    createViewMonthGrid,
    createViewMonthAgenda,
  } from '@schedule-x/calendar'
  import { createEventsServicePlugin } from '@schedule-x/events-service'
  import { createCalendarControlsPlugin } from '@schedule-x/calendar-controls'
  import '@schedule-x/theme-default/dist/index.css'
  import 'temporal-polyfill/global'

  import Modal from '../components/Modal.vue'
  import { useCalendarFilter } from '../composables/useCalendarFilter'
  import { useColorMode } from '../composables/useColorMode'

  import type { CalendarEventExternal } from '@schedule-x/calendar'

  interface JahrweiserEvent extends CalendarEventExternal {
    _calendar: string
    _originalId: string
    _occurrence?: number
  }

  const { locale, localeProperties } = useI18n()

  definePageMeta({
    middleware: ['authenticated'],
  })

  const modal = ref()

  const event = ref()
  const eventLoading = ref(false)
  const eventTitle = ref('')
  const eventStartDate = computed(() => event.value?.startDate ?? '')
  const eventDuration = computed(() => event.value?.duration?.replace(/^PT?/, '') ?? '')
  const eventLocation = computed(() => event.value?.location ?? '')
  const eventUrl = computed(() => event.value?.url ?? '')
  const eventDescription = computed(() => {
    const desc = event.value?.description
    if (!desc) return ''
    return desc
      .split('\n')
      .map((line: string) => line.trimStart())
      .join('\n')
  })
  const calendars = ref<{ name: string; color: string }[]>([])
  const { hiddenCalendars, setLegend, toggleCalendar } = useCalendarFilter()
  const { isDark } = useColorMode()

  /* ── Design palette — one unique color per calendar ── */

  const designPalette = [
    { light: { bg: '#dfc8b4', border: '#9a3412', text: '#1e293b' }, dark: { bg: '#583020', border: '#c2410c', text: '#e8ddd0' } }, // sienna
    { light: { bg: '#c8bdd6', border: '#6b21a8', text: '#1e293b' }, dark: { bg: '#3e2260', border: '#7e22ce', text: '#e8ddd0' } }, // plum
    { light: { bg: '#d4b4b4', border: '#9f1239', text: '#1e293b' }, dark: { bg: '#5c1a2a', border: '#e11d48', text: '#e8ddd0' } }, // rose
    { light: { bg: '#b4c8d8', border: '#1e5a8a', text: '#1e293b' }, dark: { bg: '#1c3a54', border: '#3b82f6', text: '#e8ddd0' } }, // steel
    { light: { bg: '#c4c8cc', border: '#475569', text: '#1e293b' }, dark: { bg: '#2e3440', border: '#94a3b8', text: '#e8ddd0' } }, // slate
    { light: { bg: '#b8d0b4', border: '#2d6a30', text: '#1e293b' }, dark: { bg: '#1e3e20', border: '#4ade80', text: '#e8ddd0' } }, // forest
    { light: { bg: '#c5d0a6', border: '#4d7c0f', text: '#1e293b' }, dark: { bg: '#344818', border: '#65a30d', text: '#e8ddd0' } }, // olive
    { light: { bg: '#ddd0a6', border: '#b45309', text: '#1e293b' }, dark: { bg: '#5c4418', border: '#d97706', text: '#e8ddd0' } }, // mustard
    { light: { bg: '#adc8c4', border: '#0f766e', text: '#1e293b' }, dark: { bg: '#184844', border: '#0d9488', text: '#e8ddd0' } }, // craft
    { light: { bg: '#d8c4a4', border: '#78591a', text: '#1e293b' }, dark: { bg: '#4a3818', border: '#a57c2a', text: '#e8ddd0' } }, // bronze
    { light: { bg: '#d0bcc8', border: '#8a2060', text: '#1e293b' }, dark: { bg: '#502040', border: '#c026a0', text: '#e8ddd0' } }, // magenta
    { light: { bg: '#d8c0c0', border: '#7a3030', text: '#1e293b' }, dark: { bg: '#4a2020', border: '#b44040', text: '#e8ddd0' } }, // brick
  ]

  const calendarLegend = computed(() =>
    calendars.value.map((cal, i) => {
      const palette = designPalette[i % designPalette.length]!
      const { border } = isDark.value ? palette.dark : palette.light
      return { name: cal.name, dotColor: border }
    }),
  )

  watch(
    calendarLegend,
    (v) => {
      setLegend(v)
    },
    { immediate: true },
  )

  function capitalize(s: string) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
  }

  /* ── Schedule-X setup (client-only — createCalendar accesses document) ── */

  let eventsService: ReturnType<typeof createEventsServicePlugin>
  let calendarControls: ReturnType<typeof createCalendarControlsPlugin>

  // shallowRef — Schedule-X uses Preact Signals internally, no deep reactivity needed
  const calendarApp = shallowRef<ReturnType<typeof createCalendar>>()

  const today = Temporal.PlainDate.from(new Date().toISOString().slice(0, 10))

  if (import.meta.client) {
    eventsService = createEventsServicePlugin()
    calendarControls = createCalendarControlsPlugin()

    calendarApp.value = createCalendar(
      {
        locale: localeProperties.value.language ?? 'de-DE',
        selectedDate: today,
        views: [createViewMonthGrid(), createViewMonthAgenda()],
        defaultView: 'month-grid',
        isDark: isDark.value,
        firstDayOfWeek: 1,
        isResponsive: true,
        calendars: {},
        callbacks: {
          onEventClick(calendarEvent) {
            clickItem(calendarEvent as JahrweiserEvent)
          },
          onRangeUpdate(range) {
            void fetchDataForRange(range.start, range.end)
          },
        },
      },
      [eventsService, calendarControls],
    )
  }

  /* ── Navigation state ── */

  const currentDate = ref(today)

  const currentPeriodLabel = computed(() => {
    const d = currentDate.value
    const jsDate = new Date(d.year, d.month - 1, d.day)
    return jsDate.toLocaleDateString(locale.value, { year: 'numeric', month: 'long' })
  })

  const prevMonthLabel = computed(() => {
    const d = currentDate.value.subtract({ months: 1 })
    const jsDate = new Date(d.year, d.month - 1, d.day)
    return jsDate.toLocaleDateString(locale.value, { month: 'long' })
  })

  const nextMonthLabel = computed(() => {
    const d = currentDate.value.add({ months: 1 })
    const jsDate = new Date(d.year, d.month - 1, d.day)
    return jsDate.toLocaleDateString(locale.value, { month: 'long' })
  })

  const isCurrentMonth = computed(() => {
    const now = Temporal.PlainDate.from(new Date().toISOString().slice(0, 10))
    return currentDate.value.year === now.year && currentDate.value.month === now.month
  })

  function navigatePeriod(direction: 1 | -1) {
    const next =
      direction === 1
        ? currentDate.value.add({ months: 1 })
        : currentDate.value.subtract({ months: 1 })
    currentDate.value = next
    calendarControls?.setDate(next)
  }

  function navigateToToday() {
    const now = Temporal.PlainDate.from(new Date().toISOString().slice(0, 10))
    currentDate.value = now
    calendarControls?.setDate(now)
  }

  /* ── Touch swipe ── */

  let touchStartX = 0
  let touchStartY = 0

  function onTouchStart(e: TouchEvent) {
    touchStartX = e.changedTouches[0]!.clientX
    touchStartY = e.changedTouches[0]!.clientY
  }

  function onTouchEnd(e: TouchEvent) {
    const dx = e.changedTouches[0]!.clientX - touchStartX
    const dy = e.changedTouches[0]!.clientY - touchStartY
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return
    navigatePeriod(dx < 0 ? 1 : -1)
  }

  /* ── Keyboard navigation ── */

  function handleKeyboard(e: KeyboardEvent) {
    if (modal.value && isModalOpen()) return
    if (e.key === 'ArrowLeft' || e.key === 'a') navigatePeriod(-1)
    else if (e.key === 'ArrowRight' || e.key === 'd') navigatePeriod(1)
  }

  function isModalOpen() {
    return document.getElementById('default-modal')?.classList.contains('modal-open')
  }

  /* ── Legend hover — open when cursor is near/below cal-wrapper bottom ── */

  const calWrapper = ref<HTMLElement>()
  const legendHover = ref(false)
  const LEGEND_TRIGGER_PX = 40
  let legendLeaveTimer: ReturnType<typeof setTimeout> | undefined

  function onMouseMove(e: MouseEvent) {
    /* v8 ignore start -- defensive guard, calWrapper is always set when listener is active */
    if (!calWrapper.value) return
    const bottom = calWrapper.value.getBoundingClientRect().bottom
    /* v8 ignore stop */
    if (e.clientY >= bottom - LEGEND_TRIGGER_PX) {
      clearTimeout(legendLeaveTimer)
      legendHover.value = true
    } else if (legendHover.value) {
      clearTimeout(legendLeaveTimer)
      legendLeaveTimer = setTimeout(() => {
        legendHover.value = false
      }, 300)
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyboard)
    document.addEventListener('mousemove', onMouseMove)
  })
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyboard)
    document.removeEventListener('mousemove', onMouseMove)
    clearTimeout(legendLeaveTimer)
  })

  /* ── Dark mode reactivity ── */

  watch(isDark, (dark) => {
    calendarApp.value?.setTheme(dark ? 'dark' : 'light')
  })

  /* ── Data loading ── */

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawEvents = ref<any[]>([])
  const calLoading = ref(false)

  function buildScheduleXCalendars() {
    const config: Record<
      string,
      {
        colorName: string
        lightColors: { main: string; container: string; onContainer: string }
        darkColors: { main: string; container: string; onContainer: string }
      }
    > = {}
    calendars.value.forEach((cal, i) => {
      const palette = designPalette[i % designPalette.length]!
      config[`cal-${i}`] = {
        colorName: `cal-${i}`,
        lightColors: {
          main: palette.light.border,
          container: palette.light.bg,
          onContainer: palette.light.text,
        },
        darkColors: {
          main: palette.dark.border,
          container: palette.dark.bg,
          onContainer: palette.dark.text,
        },
      }
    })
    calendarControls?.setCalendars(config)
  }

  function toTemporalDate(dateStr: string): Temporal.PlainDate | Temporal.ZonedDateTime {
    // Input: 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm:ss...'
    if (dateStr.length === 10) {
      return Temporal.PlainDate.from(dateStr)
    }
    // For datetime strings, use UTC timezone
    const d = new Date(dateStr)
    return Temporal.ZonedDateTime.from({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      second: d.getUTCSeconds(),
      timeZone: 'UTC',
    })
  }

  function mapToScheduleXEvents(): JahrweiserEvent[] {
    const calIndexMap = new Map<string, number>()
    calendars.value.forEach((cal, i) => {
      calIndexMap.set(cal.name, i)
    })

    return rawEvents.value
      .filter((item) => !hiddenCalendars.value.has(item.calendar))
      .map((item) => ({
        id: item.occurrence ? `${item.id}-${item.occurrence}` : item.id,
        title: capitalize(item.title),
        start: toTemporalDate(item.startDate),
        end: toTemporalDate(item.endDate),
        calendarId: `cal-${calIndexMap.get(item.calendar) ?? 0}`,
        _calendar: item.calendar,
        _originalId: item.id,
        _occurrence: item.occurrence,
      }))
  }

  async function fetchDataForRange(start: Temporal.ZonedDateTime, end: Temporal.ZonedDateTime) {
    calLoading.value = true
    try {
      // Update currentDate from range midpoint for header labels
      const startDate = new Date(start.epochMilliseconds)
      const endDate = new Date(end.epochMilliseconds)
      const mid = new Date((startDate.getTime() + endDate.getTime()) / 2)
      currentDate.value = Temporal.PlainDate.from(mid.toISOString().slice(0, 10))

      // Fetch all calendars if not already loaded
      if (calendars.value.length === 0) {
        calendars.value = await $fetch('/api/calendars')
        buildScheduleXCalendars()
      }

      // Fetch events from all calendars in parallel
      const results = await Promise.all(
        calendars.value.map((cal) =>
          $fetch('/api/calendar', {
            method: 'POST',
            body: {
              calendar: cal.name,
              startDate: startDate,
              endDate: endDate,
            },
          }),
        ),
      )

      rawEvents.value = results.flat()
      eventsService?.set(mapToScheduleXEvents())
    } catch (error) {
      console.error(error)
    } finally {
      calLoading.value = false
    }
  }

  /* ── Filter reactivity — re-filter events without re-fetching ── */

  watch(hiddenCalendars, () => {
    eventsService.set(mapToScheduleXEvents())
  })

  /* ── Event click ── */

  function handleModalX() {
    if (eventLoading.value) return
    modal.value.close()
  }

  async function clickItem(data: JahrweiserEvent) {
    try {
      const { _calendar: calendar, _originalId: id, _occurrence: occurrence } = data
      event.value = null
      eventLoading.value = true
      eventTitle.value = capitalize(data.title || '')
      modal.value.open()
      const eventData = await $fetch('/api/event', {
        method: 'POST',
        body: {
          calendar,
          id,
          occurrence,
        },
      })
      event.value = eventData
    } catch (error) {
      console.error(error)
      modal.value.close()
    } finally {
      eventLoading.value = false
    }
  }
</script>

<style>
  /* ===== Schedule-X Calendar — Jahrweiser Vintage-Plakat Theme ===== */

  .box {
    display: flex;
    flex-flow: column;
    height: 100%;
    width: 100%;
  }

  .calendar {
    font-family: 'Source Sans 3', system-ui, sans-serif;
    color: #1e293b;
    width: 100%;
    margin-left: auto;
    margin-right: auto;
    flex: 1 1 auto;
  }

  .cal-wrapper {
    position: relative;
    display: flex;
    flex-flow: column;
    flex: 1 1 auto;
    height: 100%;
  }

  /* --- Schedule-X wrapper sizing --- */

  .sx-vue-calendar-wrapper {
    width: 100%;
    height: 100%;
    min-height: 600px;
  }

  /* --- Hide view selector (auto-responsive handles view switching) --- */

  .sx__view-selection {
    display: none !important;
  }

  /* --- Custom header (month navigation bar) --- */

  .cv-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5em 0.8em;
    background-color: #faf5eb;
    border-bottom: 1px solid rgba(194, 65, 12, 0.2);
  }

  .cv-header .periodLabel {
    font-family: 'Abril Fatface', Georgia, serif;
    font-size: 1.8em;
    color: #1e293b;
    letter-spacing: 0.02em;
    flex: 0 1 auto;
    padding-left: 0.2em;
  }

  .cv-header .cv-header-nav {
    display: flex;
    align-items: center;
    gap: 0.5em;
  }

  .cv-header button .nav-arrow {
    font-size: 1.4em;
    line-height: 1;
  }

  .cv-header button {
    color: #1e293b;
    background-color: rgba(194, 65, 12, 0.1);
    border: 1.5px solid rgba(194, 65, 12, 0.3);
    border-radius: 4px;
    font-weight: 600;
    font-size: 0.85em;
    padding: 0.3em 0.7em;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.2em;
    min-height: 2.2em;
    cursor: pointer;
    transition:
      background-color 0.15s,
      border-color 0.15s;
  }

  .cv-header button:hover {
    background-color: rgba(194, 65, 12, 0.2);
    border-color: #c2410c;
  }

  .cv-header button:active:not(:disabled) {
    transform: scale(0.93);
    transition: transform 0.1s ease;
  }

  .cv-header button:disabled {
    color: rgba(30, 41, 59, 0.3);
    background-color: transparent;
    border-color: rgba(30, 41, 59, 0.1);
    cursor: default;
  }

  /* --- Schedule-X: Weekday name strip (banner) --- */

  .sx__month-grid-day {
    background-color: #c2410c !important;
    color: #faf5eb !important;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.85em;
  }

  /* --- Schedule-X: Day cells --- */

  .sx__month-grid-wrapper {
    background-color: #faf5eb;
  }

  .sx__month-grid-cell {
    border-color: rgba(194, 65, 12, 0.12) !important;
  }

  /* --- Schedule-X: Today highlight --- */

  .sx__month-grid-day__header-date.sx__is-today,
  .sx__is-today .sx__month-grid-day__header-date {
    color: #faf5eb !important;
    font-weight: 700;
    background-color: #c2410c !important;
    border-radius: 50%;
    width: 1.5em;
    height: 1.5em;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    animation: todayCirclePulse 2s ease-in-out infinite;
  }

  @keyframes todayCirclePulse {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(0.93);
    }
  }

  /* --- Schedule-X: Events --- */

  .sx__month-grid-event {
    cursor: pointer;
    border-radius: 3px;
    font-size: 0.9em;
    transition: box-shadow 0.3s ease;
  }

  .sx__month-grid-event:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  /* --- Schedule-X: Month agenda events --- */

  .sx__month-agenda-event {
    cursor: pointer;
  }

  .sx__month-agenda-event:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  /* --- Schedule-X: Theme overrides (light) --- */

  .sx__calendar {
    --sx-color-surface: #faf5eb;
    --sx-color-on-surface: #1e293b;
    --sx-color-surface-dim: #f5edd9;
    --sx-color-on-surface-variant: rgba(30, 41, 59, 0.6);
    --sx-color-surface-container: #efe6d0;
    --sx-color-surface-container-high: #e8ddd0;
    --sx-color-outline: rgba(194, 65, 12, 0.15);
    --sx-color-outline-variant: rgba(194, 65, 12, 0.12);
    --sx-color-primary: #c2410c;
    --sx-color-on-primary: #faf5eb;
    font-family: 'Source Sans 3', system-ui, sans-serif;
  }

  /* ===================================================
     DARK MODE
     =================================================== */

  .dark .calendar {
    color: #e8ddd0;
  }

  /* --- Header (dark) --- */

  .dark .cv-header {
    background-color: #1a1714;
    border-color: #3d3630;
  }

  .dark .cv-header .periodLabel {
    color: #faf5eb;
  }

  .dark .cv-header button {
    color: #ea580c;
    border-color: #3d3630;
  }

  .dark .cv-header button:hover {
    background-color: rgba(234, 88, 12, 0.15);
    color: #f59e0b;
  }

  .dark .cv-header button:disabled {
    color: #3d3630;
    background-color: transparent;
  }

  /* --- Schedule-X: Weekday strip (dark) --- */

  .dark .sx__month-grid-day {
    background-color: #9a3412 !important;
    color: #faf5eb !important;
  }

  /* --- Schedule-X: Day cells (dark) --- */

  .dark .sx__month-grid-wrapper {
    background-color: #1a1714;
  }

  .dark .sx__month-grid-cell {
    border-color: #3d3630 !important;
  }

  /* --- Schedule-X: Today (dark) --- */

  .dark .sx__month-grid-day__header-date.sx__is-today,
  .dark .sx__is-today .sx__month-grid-day__header-date {
    color: #faf5eb !important;
    background-color: #9a3412 !important;
  }

  /* --- Schedule-X: Events (dark) --- */

  .dark .sx__month-grid-event:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  }

  .dark .sx__month-agenda-event:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  }

  /* --- Schedule-X: Theme overrides (dark) --- */

  .dark .sx__calendar {
    --sx-color-surface: #1a1714;
    --sx-color-on-surface: #e8ddd0;
    --sx-color-surface-dim: #15120f;
    --sx-color-on-surface-variant: #a8937e;
    --sx-color-surface-container: #100e0c;
    --sx-color-surface-container-high: #2e2822;
    --sx-color-outline: #3d3630;
    --sx-color-outline-variant: #3d3630;
    --sx-color-primary: #ea580c;
    --sx-color-on-primary: #faf5eb;
  }

  /* Loading overlay */
  .cal-loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(250, 245, 235, 0.6);
    z-index: 5;
  }

  .dark .cal-loading-overlay {
    background: rgba(26, 23, 20, 0.6);
  }

  /* ===== Modal content reveal ===== */

  .modal-content-reveal {
    display: grid;
    grid-template-rows: 1fr;
    animation: revealDown 0.6s ease-out;
  }

  .modal-content-inner {
    overflow: hidden;
  }

  @keyframes revealDown {
    from {
      grid-template-rows: 0fr;
      opacity: 0;
    }
    to {
      grid-template-rows: 1fr;
      opacity: 1;
    }
  }

  /* ===== Calendar legend (desktop overlay) ===== */

  .cal-legend {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: none;
    z-index: 4;
  }

  @media (min-width: 768px) {
    .cal-legend {
      display: block;
    }
  }

  .cal-legend-inner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5em;
    padding: 0;
    max-height: 0;
    overflow: hidden;
    background: transparent;
    transition:
      max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      padding 0.3s,
      background-color 0.3s;
  }

  .cal-legend.cal-legend-open .cal-legend-inner,
  .cal-legend.cal-legend-active .cal-legend-inner {
    max-height: 6em;
    padding: 0.35em 0;
    background: rgba(250, 245, 235, 0.92);
    backdrop-filter: blur(4px);
  }

  .cal-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 0.35em;
    padding: 0.2em 0.6em;
    border-radius: 3px;
    font-size: 0.85em;
    cursor: pointer;
    transition: opacity 0.2s;
    border: 1.5px solid rgba(194, 65, 12, 0.2);
    background: transparent;
    color: #1e293b;
  }

  .cal-legend-item:hover {
    border-color: rgba(194, 65, 12, 0.4);
  }

  .cal-legend-hidden {
    opacity: 0.4;
    text-decoration: line-through;
  }

  .cal-legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .cal-legend-name {
    line-height: 1;
  }

  /* Dark mode */
  .dark .cal-legend.cal-legend-open .cal-legend-inner,
  .dark .cal-legend.cal-legend-active .cal-legend-inner {
    background: rgba(26, 23, 20, 0.92);
  }

  .dark .cal-legend-item {
    color: #e8ddd0;
    border-color: #3d3630;
  }

  .dark .cal-legend-item:hover {
    border-color: rgba(234, 88, 12, 0.4);
  }

  /* ===== Utility ===== */

  @media (width <= 480px) {
    .periodLabel {
      font-size: 1.2em !important;
    }

    .nav-label {
      display: none;
    }
  }
</style>
