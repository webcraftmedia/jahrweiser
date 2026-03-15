<template>
  <div class="box" :style="boxZoomStyle">
    <div class="calendar row">
      <client-only>
        <div
          ref="calWrapper"
          class="cal-wrapper"
          @touchstart.passive="onTouchStart"
          @touchend.passive="onTouchEnd"
        >
          <div class="cv-header" :style="headerZoomStyle">
            <span class="periodLabel">{{ currentPeriodLabel }}</span>
            <div class="cv-header-nav">
              <!-- eslint-disable @intlify/vue-i18n/no-raw-text -->
              <button :aria-label="prevMonthLabel" @click="navigatePeriod(-1)">
                <span class="nav-arrow">‹</span><span class="nav-label"> {{ prevMonthLabel }}</span>
              </button>
              <!-- eslint-enable @intlify/vue-i18n/no-raw-text -->
              <button :disabled="isCurrentMonth" @click="navigateToToday()">
                {{ $t('pages.index.today') }}
              </button>
              <!-- eslint-disable @intlify/vue-i18n/no-raw-text -->
              <button :aria-label="nextMonthLabel" @click="navigatePeriod(1)">
                <span class="nav-label">{{ nextMonthLabel }} </span><span class="nav-arrow">›</span>
              </button>
              <!-- eslint-enable @intlify/vue-i18n/no-raw-text -->
            </div>
          </div>
          <ScheduleXCalendar :calendar-app="calendarApp!" :style="calendarBodyZoomStyle" />
          <!-- Loading overlay -->
          <div v-show="calLoading" class="cal-loading-overlay">
            <div class="flex items-center gap-2">
              <LoadingDots />
            </div>
          </div>
          <!-- Calendar legend / filter -->
          <div
            class="cal-legend"
            :class="{
              'cal-legend-open': legendHover || (hiddenCalendars.size > 0 && !legendDismissed),
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
                  if (hiddenCalendars.size === 0 && !legendHover) dismissLegend()
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
      <Teleport to="body">
        <Modal ref="modal" @x="handleModalX">
          <template #title>
            {{ eventTitle }}
          </template>

          <template #content>
            <!-- Loading dots -->
            <div v-if="eventLoading" class="flex justify-center items-center gap-2 py-4">
              <LoadingDots />
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
                        {{ $t('pages.index.details.calendar') }}
                      </th>
                      <td class="py-1.5">{{ eventCalendarName }}</td>
                    </tr>
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
      </Teleport>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { createCalendar, createViewMonthGrid, createViewList } from '@schedule-x/calendar'
  import { createCalendarControlsPlugin } from '@schedule-x/calendar-controls'
  import { createEventsServicePlugin } from '@schedule-x/events-service'
  import { ScheduleXCalendar } from '@schedule-x/vue'
  import '@schedule-x/theme-default/dist/index.css'

  import Modal from '../components/Modal.vue'
  import { useCalendarFilter } from '../composables/useCalendarFilter'
  import { useColorMode } from '../composables/useColorMode'
  import { useZoom } from '../composables/useZoom'

  import type { CalendarEventExternal } from '@schedule-x/calendar'

  interface RawCalendarEvent {
    calendar: string
    color: string
    id: string
    occurrence?: number
    startDate: string
    endDate: string
    title: string
    isRecurring?: boolean
  }

  interface JahrweiserEvent extends CalendarEventExternal {
    _calendar: string
    _originalId: string
    _occurrence?: number
  }

  const { locale, localeProperties } = useI18n()

  definePageMeta({
    middleware: ['authenticated'],
    alias: ['/:year(\\d{4})/:month([1-9]|1[0-2])'],
  })

  const route = useRoute()
  const router = useRouter()

  const modal = ref<InstanceType<typeof Modal>>()

  interface EventDetail {
    description?: string
    duration?: string
    endDate?: string
    location?: string
    startDate?: string
    summary: string
    uid: string
    url?: string
  }
  const selectedEvent = ref<EventDetail | null>(null)
  const eventLoading = ref(false)
  const eventTitle = ref('')
  const eventCalendar = ref('')
  const eventCalendarName = computed(() => eventCalendar.value)
  const eventStartDate = computed(() => selectedEvent.value?.startDate ?? '')
  const eventDuration = computed(() => selectedEvent.value?.duration?.replace(/^PT?/, '') ?? '')
  const eventLocation = computed(() => selectedEvent.value?.location ?? '')
  const eventUrl = computed(() => selectedEvent.value?.url ?? '')
  const eventDescription = computed(() => {
    const desc = selectedEvent.value?.description
    if (!desc) return ''
    return desc
      .split('\n')
      .map((line: string) => line.trimStart())
      .join('\n')
  })
  const calendars = ref<{ name: string; color: string }[]>([])
  const { hiddenCalendars, setLegend, toggleCalendar } = useCalendarFilter()
  const { isDark } = useColorMode()
  const { zoomLevel } = useZoom()

  // Header zooms only 30% as much as the content (similar to chromeZoom)
  const headerZoom = computed(() => (1 / zoomLevel.value) * (1 + (zoomLevel.value - 1) * 0.3))

  // Desktop: box already counter-zoomed → only slight enlargement needed (chromeZoom)
  // Mobile: no box counter-zoom → use headerZoom (partially counters parent zoom)
  const headerZoomStyle = computed(() => {
    if (zoomLevel.value === 1) return undefined
    if (lastWasSmall.value) {
      return { zoom: headerZoom.value }
    }
    return { zoom: 1 + (zoomLevel.value - 1) * 0.3 }
  })

  // Mobile: zoom the calendar body when zoom > 1
  const calendarBodyZoomStyle = computed(() => {
    if (!lastWasSmall.value || headerZoom.value === 1) return undefined
    return { zoom: headerZoom.value }
  })

  // Desktop: counter-zoom so the calendar always fills the container exactly
  const boxZoomStyle = computed(() => {
    if (lastWasSmall.value || zoomLevel.value === 1) return undefined
    return {
      zoom: 1 / zoomLevel.value,
      width: `${zoomLevel.value * 100}%`,
    }
  })

  /* ── Design palette — one unique color per calendar ── */

  const designPalette = [
    {
      light: { bg: '#dfc8b4', border: '#9a3412', text: '#1e293b' },
      dark: { bg: '#583020', border: '#c2410c', text: '#e8ddd0' },
    }, // sienna
    {
      light: { bg: '#c8bdd6', border: '#6b21a8', text: '#1e293b' },
      dark: { bg: '#3e2260', border: '#7e22ce', text: '#e8ddd0' },
    }, // plum
    {
      light: { bg: '#d4b4b4', border: '#9f1239', text: '#1e293b' },
      dark: { bg: '#5c1a2a', border: '#e11d48', text: '#e8ddd0' },
    }, // rose
    {
      light: { bg: '#b4c8d8', border: '#1e5a8a', text: '#1e293b' },
      dark: { bg: '#1c3a54', border: '#3b82f6', text: '#e8ddd0' },
    }, // steel
    {
      light: { bg: '#c4c8cc', border: '#475569', text: '#1e293b' },
      dark: { bg: '#2e3440', border: '#94a3b8', text: '#e8ddd0' },
    }, // slate
    {
      light: { bg: '#b8d0b4', border: '#2d6a30', text: '#1e293b' },
      dark: { bg: '#1e3e20', border: '#4ade80', text: '#e8ddd0' },
    }, // forest
    {
      light: { bg: '#c5d0a6', border: '#4d7c0f', text: '#1e293b' },
      dark: { bg: '#344818', border: '#65a30d', text: '#e8ddd0' },
    }, // olive
    {
      light: { bg: '#ddd0a6', border: '#b45309', text: '#1e293b' },
      dark: { bg: '#5c4418', border: '#d97706', text: '#e8ddd0' },
    }, // mustard
    {
      light: { bg: '#adc8c4', border: '#0f766e', text: '#1e293b' },
      dark: { bg: '#184844', border: '#0d9488', text: '#e8ddd0' },
    }, // craft
    {
      light: { bg: '#d8c4a4', border: '#78591a', text: '#1e293b' },
      dark: { bg: '#4a3818', border: '#a57c2a', text: '#e8ddd0' },
    }, // bronze
    {
      light: { bg: '#d0bcc8', border: '#8a2060', text: '#1e293b' },
      dark: { bg: '#502040', border: '#c026a0', text: '#e8ddd0' },
    }, // magenta
    {
      light: { bg: '#d8c0c0', border: '#7a3030', text: '#1e293b' },
      dark: { bg: '#4a2020', border: '#b44040', text: '#e8ddd0' },
    }, // brick
  ]

  const calendarLegend = computed(() =>
    calendars.value.map((cal, i) => {
      const palette = designPalette[i % designPalette.length]!
      const colors = isDark.value ? palette.dark : palette.light
      return { name: cal.name, dotColor: colors.bg }
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

  /** Local-timezone date string YYYY-MM-DD (avoids UTC shift from toISOString) */
  function localDateStr(d: Date = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  /* ── Schedule-X setup (client-only — createCalendar accesses document) ── */

  let eventsService: ReturnType<typeof createEventsServicePlugin>
  let calendarControls: ReturnType<typeof createCalendarControlsPlugin>

  // shallowRef — Schedule-X uses Preact Signals internally, no deep reactivity needed
  const calendarApp = shallowRef<ReturnType<typeof createCalendar>>()

  const today = Temporal.PlainDate.from(localDateStr())

  function parseDateFromPath(path: string): Temporal.PlainDate | null {
    const m = path.match(/^\/(\d{4})\/([1-9]|1[0-2])$/)
    if (!m) return null
    return Temporal.PlainDate.from({ year: Number(m[1]), month: Number(m[2]), day: 1 })
  }

  const initialDate = parseDateFromPath(route.path) ?? today

  /* v8 ignore start -- always true in client-side tests */
  if (import.meta.client) {
    eventsService = createEventsServicePlugin()
    calendarControls = createCalendarControlsPlugin()

    calendarApp.value = createCalendar(
      {
        locale: localeProperties.value.language ?? 'de-DE',
        selectedDate: initialDate,
        views: [createViewMonthGrid(), createViewList()],
        defaultView: 'month-grid',
        isDark: isDark.value,
        firstDayOfWeek: 1,
        isResponsive: true,
        timezone: Temporal.Now.timeZoneId(),
        calendars: {},
        callbacks: {
          onEventClick(calendarEvent) {
            void clickItem(calendarEvent as JahrweiserEvent)
          },
          async fetchEvents(range) {
            await fetchDataForRange(range.start, range.end)
            return mapToScheduleXEvents()
          },
        },
      },
      [eventsService, calendarControls],
    )
  }
  /* v8 ignore stop */

  /* ── Navigation state ── */

  const currentDate = ref(initialDate)

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
    const now = Temporal.PlainDate.from(localDateStr())
    return currentDate.value.year === now.year && currentDate.value.month === now.month
  })

  function applyFutureClassRepeatedly() {
    setTimeout(applyFutureClass, 100)
    setTimeout(applyFutureClass, 350)
    setTimeout(applyFutureClass, 700)
  }

  function navigatePeriod(direction: 1 | -1) {
    const next =
      direction === 1
        ? currentDate.value.add({ months: 1 })
        : currentDate.value.subtract({ months: 1 })
    currentDate.value = next
    // Clear events BEFORE navigation so Schedule-X has nothing cached to render
    eventsService.set([])
    calendarControls.setDate(next)
    void router.push(`/${next.year}/${next.month}`)
    applyFutureClassRepeatedly()
  }

  function navigateToToday() {
    const now = Temporal.PlainDate.from(localDateStr())
    currentDate.value = now
    eventsService.set([])
    calendarControls.setDate(now)
    void router.push(`/${now.year}/${now.month}`)
    scrollToDay()
    applyFutureClassRepeatedly()
  }

  function scrollToDay() {
    setTimeout(() => {
      // Re-apply future classes after Schedule-X re-render
      applyFutureClass()

      const todayStr = localDateStr()
      const firstOfMonth = currentDate.value.toPlainYearMonth().toPlainDate({ day: 1 }).toString()

      // Try today: month-grid (.sx__is-today) or list view (data-date)
      const todayEl =
        document.querySelector('.sx__is-today')?.closest('.sx__month-grid-day') ??
        document.querySelector(`.sx__list-day[data-date="${todayStr}"]`)
      if (todayEl) {
        todayEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }

      // Nearest upcoming day with events in current month (list view)
      const nearestDay =
        isCurrentMonth.value &&
        Array.from(document.querySelectorAll<HTMLElement>('.sx__list-day[data-date]')).find(
          (el) => el.dataset.date! >= todayStr,
        )
      if (nearestDay) {
        nearestDay.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }

      // Fallback: 1st of month in month-grid or list view
      const firstDayEl =
        document.querySelector(`.sx__month-grid-day[data-date="${firstOfMonth}"]`) ??
        document.querySelector(`.sx__list-day[data-date="${firstOfMonth}"]`)
      if (firstDayEl) {
        firstDayEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }

      // Last fallback: scroll to top
      calWrapper.value?.closest('.content')?.scrollTo({ top: 0, behavior: 'smooth' })
    }, 350)
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
    if (modal.value?.isOpen) return
    if (e.key === 'ArrowLeft' || e.key === 'a') navigatePeriod(-1)
    else if (e.key === 'ArrowRight' || e.key === 'd') navigatePeriod(1)
  }

  /* ── Legend hover — open when cursor is near/below cal-wrapper bottom ── */

  const calWrapper = ref<HTMLElement>()
  const legendHover = ref(false)
  const LEGEND_TRIGGER_PX = 40
  let legendLeaveTimer: ReturnType<typeof setTimeout> | undefined
  const legendDismissed = ref(false)

  function dismissLegend() {
    legendHover.value = false
    legendDismissed.value = true
  }

  let mouseMoveFrame: number | undefined
  function onMouseMove(e: MouseEvent) {
    if (mouseMoveFrame) return
    /* v8 ignore start -- RAF callback internals not tracked by v8 with fake timers */
    mouseMoveFrame = requestAnimationFrame(() => {
      mouseMoveFrame = undefined
      if (!calWrapper.value) return
      const bottom = calWrapper.value.getBoundingClientRect().bottom
      if (e.clientY >= bottom - LEGEND_TRIGGER_PX) {
        if (!legendDismissed.value) {
          clearTimeout(legendLeaveTimer)
          legendHover.value = true
        }
      } else {
        legendDismissed.value = false
        if (legendHover.value) {
          clearTimeout(legendLeaveTimer)
          legendLeaveTimer = setTimeout(() => {
            legendHover.value = false
          }, 300)
        }
      }
    })
    /* v8 ignore stop */
  }

  /* ── Responsive view switching (month-grid ↔ list at 700px) ── */

  const SX_BREAKPOINT = 700
  const lastWasSmall = ref(false)

  function onResize() {
    const isSmall = window.innerWidth < SX_BREAKPOINT
    if (isSmall === lastWasSmall.value) return
    lastWasSmall.value = isSmall
    calendarControls.setView(isSmall ? 'list' : 'month-grid')
    applyFutureClassRepeatedly()
  }

  onMounted(() => {
    lastWasSmall.value = window.innerWidth < SX_BREAKPOINT
    window.addEventListener('keydown', handleKeyboard)
    window.addEventListener('resize', onResize)
    document.addEventListener('mousemove', onMouseMove)
    if (!parseDateFromPath(route.path)) {
      void router.replace(`/${today.year}/${today.month}`)
    }
  })
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyboard)
    window.removeEventListener('resize', onResize)
    document.removeEventListener('mousemove', onMouseMove)
    clearTimeout(legendLeaveTimer)
    if (mouseMoveFrame) cancelAnimationFrame(mouseMoveFrame)
  })

  /* ── Dark mode reactivity ── */

  watch(isDark, (dark) => {
    calendarApp.value?.setTheme(dark ? 'dark' : 'light')
  })

  /* ── Browser back/forward ── */

  watch(
    () => route.path,
    (path) => {
      const target = parseDateFromPath(path)
      if (!target) return
      if (target.year === currentDate.value.year && target.month === currentDate.value.month) return
      currentDate.value = target
      eventsService.set([])
      calendarControls.setDate(target)
      applyFutureClassRepeatedly()
    },
  )

  /* ── Data loading ── */

  const rawEvents = ref<RawCalendarEvent[]>([])
  const calLoading = ref(false)

  function buildScheduleXCalendars() {
    const config: Record<
      string,
      {
        colorName: string
        lightColors: { main: string; container: string; onContainer: string }
        darkColors: { main: string; container: string; onContainer: string }
      }
      /* v8 ignore next */
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
    calendarControls.setCalendars(config)
  }

  function toTemporalDate(dateStr: string): Temporal.PlainDate | Temporal.ZonedDateTime {
    // Input: 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm:ss...'
    if (dateStr.length === 10) {
      return Temporal.PlainDate.from(dateStr)
    }
    // Store as UTC — Schedule-X converts to configured timezone via withTimeZone()
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

  async function fetchDataForRange(
    start: Temporal.ZonedDateTime,
    end: Temporal.ZonedDateTime,
  ): Promise<void> {
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
          }).catch((err: unknown) => {
            console.warn(`Failed to fetch calendar "${cal.name}":`, err)
            return []
          }),
        ),
      )

      rawEvents.value = results.flat()
      scheduleStagger()
      scrollToDay()
    } catch (error) {
      console.error(error)
    } finally {
      calLoading.value = false
    }
  }

  /* ── Mark future days ── */

  function applyFutureClass() {
    const todayStr = localDateStr()
    document
      .querySelectorAll('.sx__month-grid-day[data-date], .sx__list-day[data-date]')
      .forEach((el) => {
        const date = el.getAttribute('data-date')!
        el.classList.toggle('is-future', date >= todayStr)
        el.classList.toggle('is-today', date === todayStr)
      })
  }

  let futureDebounce: ReturnType<typeof setTimeout> | undefined
  function debouncedApplyFuture() {
    clearTimeout(futureDebounce)
    futureDebounce = setTimeout(applyFutureClass, 30)
  }

  /* ── Stagger event animations — events pop in chronologically ── */

  let staggerTimers: ReturnType<typeof setTimeout>[] = []
  let staggerDelay: ReturnType<typeof setTimeout> | undefined

  function runStagger(events: HTMLElement[]) {
    staggerTimers.forEach(clearTimeout)
    staggerTimers = []

    // Sort chronologically by parent day date
    events.sort((a, b) => {
      const dateA = a.closest('.sx__month-grid-day')?.getAttribute('data-date') ?? ''
      const dateB = b.closest('.sx__month-grid-day')?.getAttribute('data-date') ?? ''
      return dateA.localeCompare(dateB)
    })

    // Hide all immediately (clear transition first so the hide is instant)
    events.forEach((el) => {
      el.style.transition = 'none'
      el.style.opacity = '0'
      el.style.transform = 'translateY(4px)'
    })

    // Force browser to commit opacity:0 before starting fade-in
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    events[0]?.offsetHeight

    // Stagger fade-in chronologically
    events.forEach((el, i) => {
      staggerTimers.push(
        setTimeout(() => {
          el.style.transition = 'opacity 0.4s ease, transform 0.4s ease'
          el.style.opacity = '1'
          el.style.transform = 'translateY(0)'
        }, i * 50),
      )
    })
  }

  /** Schedule stagger — hides events immediately via synchronous DOM ops, then animates after re-render */
  function scheduleStagger() {
    clearTimeout(staggerDelay)
    staggerTimers.forEach(clearTimeout)
    staggerTimers = []

    // 1) Synchronously hide ALL existing event elements (immediate, no Vue reactivity delay)
    document
      .querySelectorAll<HTMLElement>('.sx__month-grid-event, .sx__list-event')
      .forEach((el) => {
        el.style.transition = 'none'
        el.style.opacity = '0'
      })

    // 2) Add class to wrapper so NEW elements created by Schedule-X during re-render are also hidden
    calWrapper.value?.classList.add('stagger-pending')

    staggerDelay = setTimeout(() => {
      calWrapper.value?.classList.remove('stagger-pending')
      const events = document.querySelectorAll<HTMLElement>('.sx__month-grid-event')
      if (events.length > 0) {
        runStagger(Array.from(events))
      }
    }, 120)
  }

  // Observe the calendar root for applyFutureClass
  let calendarObserver: MutationObserver | undefined
  onMounted(() => {
    setTimeout(applyFutureClass, 100)
    setTimeout(applyFutureClass, 500)

    const root = document.querySelector('.sx__calendar')
    if (root) {
      calendarObserver = new MutationObserver(debouncedApplyFuture)
      calendarObserver.observe(root, { childList: true, subtree: true })
    }
  })
  onUnmounted(() => {
    calendarObserver?.disconnect()
    clearTimeout(futureDebounce)
    clearTimeout(staggerDelay)
    staggerTimers.forEach(clearTimeout)
  })

  /* ── Filter reactivity — re-filter events without re-fetching ── */

  watch(hiddenCalendars, () => {
    eventsService.set(mapToScheduleXEvents())
  })

  /* ── Event click ── */

  function handleModalX() {
    if (eventLoading.value) return
    modal.value?.close()
  }

  async function clickItem(data: JahrweiserEvent) {
    try {
      const { _calendar: calendar, _originalId: id, _occurrence: occurrence } = data
      selectedEvent.value = null
      eventLoading.value = true
      eventTitle.value = capitalize(data.title || '')
      eventCalendar.value = calendar
      modal.value?.open()
      const eventData = await $fetch('/api/event', {
        method: 'POST',
        body: {
          calendar,
          id,
          occurrence,
        },
      })
      selectedEvent.value = eventData
    } catch (error) {
      console.error(error)
      modal.value?.close()
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

  /* --- Prevent horizontal scrollbar during slide animation --- */

  .sx__view-container {
    overflow-x: hidden;
  }

  /* --- Hide view selector (auto-responsive handles view switching) --- */

  .sx__view-selection {
    display: none !important;
  }

  /* --- Override Schedule-X slide: translateX only (no blur/opacity — stagger handles events) --- */

  .sx__slide-left {
    animation: sx-slide-left-clean 0.3s ease-out !important;
  }

  .sx__slide-right {
    animation: sx-slide-right-clean 0.3s ease-out !important;
  }

  @keyframes sx-slide-left-clean {
    from {
      transform: translateX(8%);
    }
    to {
      transform: translateX(0);
    }
  }

  @keyframes sx-slide-right-clean {
    from {
      transform: translateX(-8%);
    }
    to {
      transform: translateX(0);
    }
  }

  /* Counter-animate weekday header row so it stays in place */
  .sx__slide-left .sx__month-grid-week:first-child {
    animation: sx-counter-slide-left 0.3s ease-out;
  }

  .sx__slide-right .sx__month-grid-week:first-child {
    animation: sx-counter-slide-right 0.3s ease-out;
  }

  @keyframes sx-counter-slide-left {
    from {
      transform: translateX(-8%);
    }
    to {
      transform: translateX(0);
    }
  }

  @keyframes sx-counter-slide-right {
    from {
      transform: translateX(8%);
    }
    to {
      transform: translateX(0);
    }
  }

  /* --- Hide Schedule-X default header — our .cv-header is outside the component --- */

  .sx__calendar-header {
    display: none;
  }

  /* --- Custom header (month navigation bar) --- */

  .cv-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25em 0;
    background-color: #faf5eb;
    border-bottom: 1px solid rgba(194, 65, 12, 0.2);
  }

  @media (max-width: 1536px) {
    .cv-header {
      padding-left: 8px;
      padding-right: 8px;
    }
  }

  @media (max-width: 767px) {
    .cv-header {
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .sx__month-grid-day,
    .sx__list-day {
      scroll-margin-top: 48.2px;
    }
  }

  .cv-header .periodLabel {
    font-family: 'Abril Fatface', Georgia, serif;
    font-size: 1.8em;
    color: #1e293b;
    letter-spacing: 0.02em;
    flex: 0 1 auto;
    padding-left: 0.1em;
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

  .sx__month-grid-day__header-day-name {
    background-color: #c2410c !important;
    color: #faf5eb !important;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.36px;
    font-size: 17px;
    width: 100%;
    text-align: center;
    padding: 0;
    border-right: 0.5px solid rgba(154, 52, 18, 0.3);
  }

  /* --- Schedule-X: Day cells --- */

  .sx__month-grid-week:first-child {
    border-top: none !important;
    flex: 1.15 !important;
  }

  .sx__month-grid-week:first-child .sx__month-grid-day {
    padding-top: 0 !important;
    border-inline-end: none !important;
    gap: 0 !important;
  }

  .sx__month-grid-week:first-child .sx__month-grid-day__header {
    padding-left: 0 !important;
  }

  .sx__month-grid-wrapper {
    background-color: rgb(245, 237, 217);
  }

  .sx__month-grid-week {
    border-top: 0.5px solid rgba(194, 65, 12, 0.12) !important;
  }

  .sx__month-grid-day:not(:last-child) {
    border-inline-end: 0.5px solid rgba(194, 65, 12, 0.12) !important;
  }

  .sx__month-grid-cell {
    height: 26px !important;
  }

  .sx__month-grid-day__header {
    align-items: flex-start !important;
    overflow: visible;
    padding-left: 2px;
  }

  .sx__month-grid-day {
    padding-top: 2px !important;
  }

  .sx__month-grid-day__header-date {
    font-size: 20px !important;
    padding: 0;
    line-height: 20px;
    margin-bottom: 0 !important;
    color: rgb(30, 41, 59) !important;
  }

  .sx__month-grid-day.is-leading-or-trailing .sx__month-grid-day__header-date {
    color: #9ca3af !important;
  }

  .sx__month-grid-day.is-future:not(.is-leading-or-trailing) {
    background-color: #faf5eb !important;
  }

  /* --- Schedule-X: Today highlight (red triangle top-right) --- */

  .sx__month-grid-day__header-date.sx__is-today,
  .sx__is-today .sx__month-grid-day__header-date {
    color: #faf5eb !important;
    font-weight: 700;
    width: 30px !important;
    height: 30px !important;
    margin-bottom: -6px !important;
    position: relative;
    background-color: transparent !important;
    z-index: 0;
  }

  .sx__month-grid-day__header-date.sx__is-today::before,
  .sx__is-today .sx__month-grid-day__header-date::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background-color: #c2410c;
    z-index: -1;
    animation: todayCirclePulse 2s ease-in-out infinite;
  }

  @keyframes todayCirclePulse {
    0%,
    100% {
      transform: scale(0.95);
    }
    50% {
      transform: scale(1.08);
    }
  }

  .sx__month-grid-day:has(.sx__is-today)::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 0 12px 12px 0;
    border-color: transparent #c2410c transparent transparent;
    pointer-events: none;
  }

  /* --- Schedule-X: Events --- */

  .sx__month-grid-day__events {
    grid-gap: 2px !important;
  }

  @media (min-width: 768px) {
    .sx__month-grid-day__events {
      grid-gap: 1px !important;
    }
  }

  .stagger-pending .sx__month-grid-event,
  .stagger-pending .sx__list-event {
    opacity: 0 !important;
    transition: none !important;
  }

  .sx__month-grid-event {
    cursor: pointer;
    border-radius: 3px;
    font-size: 0.9em;
    line-height: 1.05;
    transition: box-shadow 0.2s ease;
    min-width: calc(100% - 1px);
    margin-left: 0.5px;
    padding: 4px 6px !important;
    border-inline-start-width: 3px !important;
    overflow: hidden !important;
    white-space: nowrap !important;
    position: relative;
    z-index: 1;
  }

  .sx__month-grid-event-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .sx__month-grid-event-time {
    display: none;
  }

  .sx__month-grid-event:hover {
    box-shadow: none !important;
    white-space: normal !important;
    overflow: visible !important;
    z-index: 100;
  }

  .sx__month-grid-event:hover .sx__month-grid-event-title {
    position: absolute;
    top: 0;
    left: -3px;
    right: 0;
    padding: 4px 6px;
    background: inherit;
    white-space: normal;
    border-radius: 3px;
    border-inline-start: 3px solid;
    border-inline-start-color: inherit;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    animation: expandDown 0.4s ease-out;
  }

  @keyframes expandDown {
    from {
      max-height: 26px;
    }
    to {
      max-height: 200px;
    }
  }

  /* --- Schedule-X: List view events --- */

  .sx__list-event {
    cursor: pointer;
  }

  .sx__list-day-events {
    padding: 0 !important;
  }

  .sx__list-event {
    padding: 0.75rem 8px 0.75rem 0 !important;
  }

  @media (max-width: 767px) {
    .sx__list-event:hover,
    .sx__list-event:active {
      box-shadow: none !important;
      background: inherit !important;
    }
  }

  @media (min-width: 768px) {
    .sx__list-event:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }
  }

  .sx__list-day-margin {
    height: 0 !important;
  }

  /* --- Schedule-X: List view — today triangle --- */

  .sx__list-day.is-today .sx__list-day-header {
    position: relative;
  }

  .sx__list-day.is-today .sx__list-day-date {
    font-weight: 800 !important;
    color: #1e293b !important;
  }

  .dark .sx__list-day.is-today .sx__list-day-date {
    color: #e8ddd0 !important;
  }

  .sx__list-day.is-today .sx__list-day-header::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 0 12px 12px 0;
    border-color: transparent #c2410c transparent transparent;
    pointer-events: none;
  }

  /* --- Schedule-X: List view — past vs future contrast --- */

  .sx__list-day:not(.is-future) .sx__list-day-events {
    background-color: #efe6d0 !important;
  }

  .sx__list-day:not(.is-future) .sx__list-day-header {
    background-color: #e8ddc8 !important;
  }

  .dark .sx__list-day:not(.is-future) .sx__list-day-events {
    background-color: #14120f !important;
  }

  .dark .sx__list-day:not(.is-future) .sx__list-day-header {
    background-color: #1a1714 !important;
  }

  /* --- Schedule-X: Theme overrides (light) --- */

  .sx__calendar {
    --sx-rounding-extra-small: 0;
    --sx-rounding-small: 0;
    --sx-rounding-extra-large: 0;
    border: none;
    --sx-color-surface: #faf5eb;
    --sx-color-on-surface: #1e293b;
    --sx-color-surface-dim: #f5edd9;
    --sx-color-on-surface-variant: rgba(30, 41, 59, 0.6);
    --sx-color-surface-container: #efe6d0;
    --sx-color-surface-container-high: #e8ddd0;
    --sx-color-surface-container-low: #f5edd9;
    --sx-color-background: #faf5eb;
    --sx-color-on-background: #1e293b;
    --sx-color-neutral: rgba(30, 41, 59, 0.6);
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

  .dark .sx__month-grid-day__header-day-name {
    background-color: #9a3412 !important;
    color: #faf5eb !important;
  }

  /* --- Schedule-X: Day cells (dark) --- */

  .dark .sx__month-grid-wrapper {
    background-color: #1a1714;
  }

  .dark .sx__month-grid-day {
    background-color: #1a1714 !important;
  }

  .dark .sx__month-grid-day.is-future:not(.is-leading-or-trailing) {
    background-color: #24201b !important;
  }

  .dark .sx__month-grid-week {
    border-color: #3d3630 !important;
  }

  .dark .sx__month-grid-day:not(:last-child) {
    border-inline-end-color: #3d3630 !important;
  }

  .dark .sx__month-grid-day__header-date {
    color: #e8ddd0 !important;
  }

  .dark .sx__month-grid-day.is-leading-or-trailing .sx__month-grid-day__header-date {
    color: #5c524a !important;
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

  @media (min-width: 768px) {
    .dark .sx__list-event:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    }
  }

  /* --- Schedule-X: Theme overrides (dark) --- */

  .dark .sx__calendar {
    --sx-color-surface: #1a1714;
    --sx-color-on-surface: #e8ddd0;
    --sx-color-surface-dim: #15120f;
    --sx-color-on-surface-variant: #a8937e;
    --sx-color-surface-container: #100e0c;
    --sx-color-surface-container-high: #2e2822;
    --sx-color-surface-container-low: #2a2420;
    --sx-color-background: #1a1714;
    --sx-color-on-background: #e8ddd0;
    --sx-color-neutral: #a8937e;
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

  .cal-legend.cal-legend-open .cal-legend-inner {
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
  .dark .cal-legend.cal-legend-open .cal-legend-inner {
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
