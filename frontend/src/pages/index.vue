<template>
  <div class="box">
    <div class="calendar row">
      <client-only>
        <CalendarView
          v-bind="calendar"
          class="theme-default"
          @click-item="clickItem"
        >
          <template #header="{ headerProps }">
            <div class="cv-header">
              <span class="periodLabel">{{ headerProps.periodLabel }}</span>
              <div class="cv-header-nav">
                <button
                  :disabled="!headerProps.previousPeriod"
                  @click="setShowDate(headerProps.previousPeriod!)"
                >
                  ‹
                </button>
                <button @click="setShowDate(headerProps.currentPeriod)">
                  {{ $t('pages.index.today') }}
                </button>
                <button
                  :disabled="!headerProps.nextPeriod"
                  @click="setShowDate(headerProps.nextPeriod!)"
                >
                  ›
                </button>
              </div>
            </div>
          </template>
        </CalendarView>
      </client-only>
      <Modal ref="modal" @x="handleModalX">
        <template #title>
          {{ event?.summary }}
        </template>

        <template #content>
          <table class="text-left align-top text-navy dark:text-ivory font-body">
            <tbody>
              <tr>
                <th class="pr-4 font-semibold">{{ $t('pages.index.details.start') }}</th>
                <td>{{ event?.startDate }}</td>
              </tr>
              <tr>
                <th class="pr-4 font-semibold">{{ $t('pages.index.details.duration') }}</th>
                <td>{{ event?.duration.replace(/^PT?/, '') }}</td>
              </tr>
              <tr>
                <th class="pr-4 font-semibold">{{ $t('pages.index.details.location') }}</th>
                <td>{{ event?.location }}</td>
              </tr>
              <tr></tr>
            </tbody>
          </table>
          <pre class="text-left whitespace-pre-wrap text-navy dark:text-ivory font-body">{{
            event?.description
              ?.split('\n')
              .map((line: string) => line.trimStart())
              .join('\n')
          }}</pre>
        </template>
      </Modal>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { CalendarView } from 'vue-simple-calendar'

  import Modal from '../components/Modal.vue'
  import { useColorMode } from '../composables/useColorMode'

  import type { ICalendarItem, INormalizedCalendarItem } from 'vue-simple-calendar'

  // const headerProps = {}

  definePageMeta({
    middleware: ['authenticated'],
  })

  const modal = ref()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawItems = ref<any[]>([])
  const event = ref()
  const calendars = ref<{ name: string; color: string }[]>([])
  const { isDark } = useColorMode()

  /* ── Design palette — one unique color per calendar ── */

  const designPalette = [
    { light: { bg: '#dfc8b4', border: '#9a3412' }, dark: { bg: '#583020', border: '#c2410c' } }, // sienna
    { light: { bg: '#c5d0a6', border: '#4d7c0f' }, dark: { bg: '#344818', border: '#65a30d' } }, // olive
    { light: { bg: '#c8bdd6', border: '#6b21a8' }, dark: { bg: '#3e2260', border: '#7e22ce' } }, // plum
    { light: { bg: '#ddd0a6', border: '#b45309' }, dark: { bg: '#5c4418', border: '#d97706' } }, // mustard
    { light: { bg: '#adc8c4', border: '#0f766e' }, dark: { bg: '#184844', border: '#0d9488' } }, // craft
    { light: { bg: '#d4b4b4', border: '#9f1239' }, dark: { bg: '#5c1a2a', border: '#e11d48' } }, // rose
    { light: { bg: '#b4c8d8', border: '#1e5a8a' }, dark: { bg: '#1c3a54', border: '#3b82f6' } }, // steel
    { light: { bg: '#d8c4a4', border: '#78591a' }, dark: { bg: '#4a3818', border: '#a57c2a' } }, // bronze
    { light: { bg: '#b8d0b4', border: '#2d6a30' }, dark: { bg: '#1e3e20', border: '#4ade80' } }, // forest
    { light: { bg: '#d0bcc8', border: '#8a2060' }, dark: { bg: '#502040', border: '#c026a0' } }, // magenta
    { light: { bg: '#b4c4c8', border: '#3a5a64' }, dark: { bg: '#283e44', border: '#5ea0b0' } }, // slate
    { light: { bg: '#d8c0c0', border: '#7a3030' }, dark: { bg: '#4a2020', border: '#b44040' } }, // brick
  ]

  const calendarColorMap = computed(() => {
    const map = new Map<string, (typeof designPalette)[0]>()
    calendars.value.forEach((cal, i) => {
      map.set(cal.color, designPalette[i % designPalette.length])
    })
    return map
  })

  const items = computed<ICalendarItem[]>(() =>
    rawItems.value.map((item) => {
      const palette = calendarColorMap.value.get(item.color) ?? designPalette[0]
      const { bg, border } = isDark.value ? palette.dark : palette.light
      return {
        ...item,
        style: `background-color: ${bg}; border-left-color: ${border}`,
      }
    }),
  )

  function handleModalX() {
    modal.value.close()
  }

  async function clickItem(data: INormalizedCalendarItem) {
    try {
      const {
        originalItem: { calendar, id, occurrence },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } = data as any
      const eventDate = await $fetch('/api/event', {
        method: 'POST',
        body: {
          calendar,
          id,
          occurrence,
        },
      })
      event.value = eventDate
      modal.value.open()
    } catch (error) {
      console.error(error)
    }
  }

  const calendar = ref({
    showDate: new Date(),
    items,
    // message: "test",
    locale: 'de-DE',
    startingDayOfWeek: 1,
    disablePast: false,
    disableFuture: false,
    displayPeriodUom: 'month',
    displayPeriodCount: 1,
    displayWeekNumbers: false,
    showTimes: false,
    // selectionStart: undefined,
    // selectionEnd: undefined,
    // newItemTitle: "",
    // newItemStartDate: "",
    // newItemEndDate: "",
    //useDefaultTheme: true,
    //useHolidayTheme: true,
    //useTodayIcons: false,
    // timeFormatOptions: "{ hour: 'numeric', minute: '2-digit' }",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    periodChangedCallback: (data: any) => {
      const startDate = data.value.displayFirstDate.value
      const endDate = data.value.displayLastDate.value
      void getData(startDate, endDate)
    },
    /*
				:
				:enable-drag-drop="true"
				:date-classes="myDateClasses"
				:period-changed-callback="periodChanged"
				:current-period-label="useTodayIcons ? 'icons' : ''"
				:enable-date-selection="true"
				:selection-start="selectionStart"
				:selection-end="selectionEnd"
				@date-selection-start="setSelection"
				@date-selection="setSelection"
				@date-selection-finish="finishSelection"
				@drop-on-date="onDrop"
				@click-date="onClickDay"
        */
  })

  function setShowDate(d: Date) {
    calendar.value.showDate = d
  }

  async function getData(startDate: Date, endDate: Date) {
    try {
      // Fetch all calendars if not already loaded
      if (calendars.value.length === 0) {
        calendars.value = await $fetch('/api/calendars')
      }

      // Fetch events from all calendars in parallel
      const results = await Promise.all(
        calendars.value.map((cal) =>
          $fetch('/api/calendar', {
            method: 'POST',
            body: {
              calendar: cal.name,
              startDate,
              endDate,
            },
          }),
        ),
      )

      // Store raw events (colors applied via computed property)
      rawItems.value = results.flat()
    } catch (error) {
      console.error(error)
    }
  }
</script>

<style>
  @import '~/../node_modules/vue-simple-calendar/dist/vue-simple-calendar.css';

  /* ===== Jahrweiser Calendar Theme — Vintage-Plakat-Stil ===== */

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

  /* --- Header (month navigation bar) --- */

  .theme-default .cv-header {
    background-color: #faf5eb;
    border-color: rgba(194, 65, 12, 0.2);
    justify-content: space-between;
  }

  .theme-default .cv-header .periodLabel {
    font-family: 'Abril Fatface', Georgia, serif;
    font-size: 1.8em;
    color: #1e293b;
    letter-spacing: 0.02em;
    flex: 0 1 auto;
    margin-left: 0;
    padding-left: 0.2em;
  }

  .theme-default .cv-header .cv-header-nav {
    display: flex;
    align-items: center;
    gap: 0.3em;
  }

  .theme-default .cv-header button {
    color: #1e293b;
    background-color: rgba(194, 65, 12, 0.1);
    border: 1.5px solid rgba(194, 65, 12, 0.3);
    border-radius: 4px;
    font-weight: 600;
    padding: 0.3em 0.7em;
    transition:
      background-color 0.15s,
      border-color 0.15s;
  }

  .theme-default .cv-header button:hover {
    background-color: rgba(194, 65, 12, 0.2);
    border-color: #c2410c;
  }

  .theme-default .cv-header button:disabled {
    color: rgba(30, 41, 59, 0.3);
    background-color: transparent;
    border-color: rgba(30, 41, 59, 0.1);
  }

  /* --- Weekday name strip (banner) --- */

  .theme-default .cv-header-day {
    background-color: #c2410c;
    color: #faf5eb;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.85em;
    border-color: rgba(154, 52, 18, 0.3);
  }

  .theme-default .cv-header-days {
    border-color: rgba(194, 65, 12, 0.15);
  }

  /* --- Day grid --- */

  .theme-default .cv-weeks {
    border-color: rgba(194, 65, 12, 0.15);
  }

  .theme-default .cv-week {
    border-color: rgba(194, 65, 12, 0.15);
  }

  .theme-default .cv-day {
    background-color: #faf5eb;
    border-color: rgba(194, 65, 12, 0.12);
  }

  .theme-default .cv-day.past {
    background-color: #f5edd9;
  }

  .theme-default .cv-day.outsideOfMonth {
    background-color: #efe6d0;
    opacity: 0.5;
  }

  /* --- Today highlight --- */

  .theme-default .cv-day.today {
    background-color: rgba(194, 65, 12, 0.06);
    box-shadow: inset 0 0 0 1.5px rgba(194, 65, 12, 0.35);
  }

  .theme-default .cv-day.today .cv-day-number {
    color: #c2410c;
    font-weight: 700;
  }

  /* --- Selection --- */

  .theme-default .cv-day[aria-selected='true'] {
    background-color: rgba(217, 119, 6, 0.15);
  }

  /* --- Events --- */

  .theme-default .cv-item {
    border-color: rgba(30, 41, 59, 0.15);
    border-radius: 3px;
    border-left-width: 3px;
    font-weight: 600;
    text-overflow: ellipsis;
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }

  .theme-default .cv-item:hover {
    transform: scale(1.02);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    z-index: 10 !important;
  }

  .theme-default .cv-item.continued::before,
  .theme-default .cv-item.toBeContinued::after {
    content: ' \21e2 ';
    color: rgba(30, 41, 59, 0.4);
  }

  .theme-default .cv-item.toBeContinued {
    border-right-style: none;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  .theme-default .cv-item.continued {
    border-left-style: none;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }

  .theme-default .cv-item.isHovered.hasUrl {
    text-decoration: underline;
  }

  .theme-default .cv-item .startTime,
  .theme-default .cv-item .endTime {
    font-weight: bold;
    color: rgba(30, 41, 59, 0.6);
  }

  .cv-item.span3,
  .cv-item.span4,
  .cv-item.span5,
  .cv-item.span6,
  .cv-item.span7 {
    text-align: center;
  }

  /* --- Week numbers --- */

  .theme-default .cv-weeknumber {
    background-color: #f5edd9;
    border-color: rgba(194, 65, 12, 0.15);
    color: rgba(30, 41, 59, 0.5);
  }

  .theme-default .cv-weeknumber span {
    margin: 0;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  /* --- Drag & drop --- */

  .theme-default .cv-day.draghover {
    box-shadow: inset 0 0 0.2em 0.2em #d97706;
  }

  /* ===================================================
     DARK MODE
     =================================================== */

  .dark .calendar {
    color: #e8ddd0;
  }

  /* --- Header --- */

  .dark .theme-default .cv-header {
    background-color: #1a1714;
    border-color: #3d3630;
  }

  .dark .theme-default .cv-header .periodLabel {
    color: #faf5eb;
  }

  .dark .theme-default .cv-header button {
    color: #ea580c;
    border-color: #3d3630;
  }

  .dark .theme-default .cv-header button:hover {
    background-color: rgba(234, 88, 12, 0.15);
    color: #f59e0b;
  }

  .dark .theme-default .cv-header button:disabled {
    color: #3d3630;
    background-color: transparent;
  }

  /* --- Weekday strip --- */

  .dark .theme-default .cv-header-day {
    background-color: #9a3412;
    color: #faf5eb;
    border-color: rgba(154, 52, 18, 0.5);
  }

  .dark .theme-default .cv-header-days {
    border-color: #3d3630;
  }

  /* --- Day grid --- */

  .dark .theme-default .cv-weeks {
    border-color: #3d3630;
  }

  .dark .theme-default .cv-week {
    border-color: #3d3630;
  }

  .dark .theme-default .cv-day {
    background-color: #1a1714;
    border-color: #3d3630;
  }

  .dark .theme-default .cv-day.past {
    background-color: #15120f;
  }

  .dark .theme-default .cv-day.outsideOfMonth {
    background-color: #100e0c;
    opacity: 0.5;
  }

  /* --- Today (dark) --- */

  .dark .theme-default .cv-day.today {
    background-color: rgba(234, 88, 12, 0.08);
    box-shadow: inset 0 0 0 1.5px rgba(234, 88, 12, 0.4);
  }

  .dark .theme-default .cv-day.today .cv-day-number {
    color: #ea580c;
    font-weight: 700;
  }

  /* --- Selection (dark) --- */

  .dark .theme-default .cv-day[aria-selected='true'] {
    background-color: rgba(217, 119, 6, 0.2);
  }

  /* --- Events (dark) --- */

  .dark .theme-default .cv-item {
    border-color: rgba(250, 245, 235, 0.15);
    color: #e8ddd0;
  }

  .dark .theme-default .cv-item:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .dark .theme-default .cv-item .startTime,
  .dark .theme-default .cv-item .endTime {
    color: rgba(232, 221, 208, 0.6);
  }

  .dark .theme-default .cv-item.continued::before,
  .dark .theme-default .cv-item.toBeContinued::after {
    color: rgba(232, 221, 208, 0.4);
  }

  /* --- Week numbers (dark) --- */

  .dark .theme-default .cv-weeknumber {
    background-color: #1a1714;
    border-color: #3d3630;
    color: #a8937e;
  }

  /* --- Drag & drop (dark) --- */

  .dark .theme-default .cv-day.draghover {
    box-shadow: inset 0 0 0.2em 0.2em #d97706;
  }

  /* ===== Utility ===== */

  @media (width <= 480px) {
    .periodLabel {
      font-size: 1.2em !important;
    }
  }
</style>
