<template>
  <div class="box">
    <div class="calendar row">
      <client-only>
        <CalendarView v-bind="calendar" class="theme-default" @click-item="clickItem">
          <!--holiday-us-traditional holiday-us-official-->
          <template #header="{ headerProps }">
            <CalendarViewHeader :header-props="headerProps" @input="setShowDate" />
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
  import { CalendarView, CalendarViewHeader } from 'vue-simple-calendar'

  import Modal from '../components/Modal.vue'

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
  const isDarkMode = ref(false)

  const items = computed<ICalendarItem[]>(() =>
    rawItems.value.map((item) => {
      const color = isDarkMode.value ? invertColor(item.color) : item.color
      return {
        ...item,
        style: `background-color: ${color}`,
      }
    }),
  )

  function invertColor(hex: string): string {
    // Remove # if present
    const color = hex.replace('#', '')
    // Parse RGB values
    const r = parseInt(color.substring(0, 2), 16)
    const g = parseInt(color.substring(2, 4), 16)
    const b = parseInt(color.substring(4, 6), 16)
    // Invert and convert back to hex
    const inverted = (((255 - r) << 16) | ((255 - g) << 8) | (255 - b))
      .toString(16)
      .padStart(6, '0')
    return `#${inverted}`
  }

  onMounted(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    isDarkMode.value = mediaQuery.matches
    mediaQuery.addEventListener('change', (e) => {
      isDarkMode.value = e.matches
    })
  })

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
  /* The next two lines are optional themes */
  @import '~/../node_modules/vue-simple-calendar/dist/css/default.css';
  @import '~/../node_modules/vue-simple-calendar/dist/css/holidays-us.css';
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

  /* Dark mode support for content & calendar */
  @media (prefers-color-scheme: dark) {
    .calendar {
      color: #f5f0e8;
    }

    /* Dark mode support for calendar */
    .theme-default .cv-header,
    .theme-default .cv-header-day {
      background-color: #374151;
      color: #e5e7eb;
    }

    .theme-default .cv-header button {
      color: #9ca3af;
    }

    .theme-default .cv-header button:disabled {
      color: #4b5563;
      background-color: #1f2937;
    }

    .theme-default .cv-weeknumber {
      background-color: #1f2937;
      border-color: #4b5563;
      color: #9ca3af;
    }

    .theme-default .cv-day {
      background-color: #1f2937;
      border-color: #374151;
    }

    .theme-default .cv-day.past {
      background-color: #111827;
    }

    .theme-default .cv-day.outsideOfMonth {
      background-color: #0f172a;
    }

    .theme-default .cv-day.today {
      background-color: #1e3a5f;
    }

    .theme-default .cv-day[aria-selected='true'] {
      background-color: #1e40af;
    }

    /* Dark mode events */
    .theme-default .cv-item {
      border-color: #4b5563;
      background-color: #3730a3;
      color: #e0e7ff;
    }

    .theme-default .cv-item.purple {
      background-color: #581c87;
      border-color: #6b21a8;
      color: #f3e8ff;
    }

    .theme-default .cv-item.orange {
      background-color: #9a3412;
      border-color: #c2410c;
      color: #fed7aa;
    }

    .theme-default .cv-item .startTime,
    .theme-default .cv-item .endTime {
      color: #d1d5db;
    }

    .previousYear,
    .nextYear {
      display: none;
    }
    @media (width <= 480px) {
      .periodLabel {
        /* display: none !important; */
        @apply text-base !important;
      }
    }
  }
</style>
