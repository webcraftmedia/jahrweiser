<template>
  <div class="wc-calendar-container">
    <div class="wc-calendar-wrapper">
      <client-only>
        <CalendarView v-bind="calendar" class="wc-calendar" @click-item="clickItem">
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
          <table class="wc-event-table">
            <tbody>
              <tr>
                <th>{{ $t('pages.index.details.start') }}</th>
                <td>{{ event?.startDate }}</td>
              </tr>
              <tr>
                <th>{{ $t('pages.index.details.duration') }}</th>
                <td>{{ event?.duration.replace(/^PT?/, '') }}</td>
              </tr>
              <tr>
                <th>{{ $t('pages.index.details.location') }}</th>
                <td>{{ event?.location }}</td>
              </tr>
            </tbody>
          </table>
          <pre class="wc-event-description">{{
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
import {
  CalendarView,
  CalendarViewHeader,
  type ICalendarItem,
  type INormalizedCalendarItem,
} from 'vue-simple-calendar'
import Modal from '../components/Modal.vue'

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
  const inverted = (((255 - r) << 16) | ((255 - g) << 8) | (255 - b)).toString(16).padStart(6, '0')
  return `#${inverted}`
}

onMounted(() => {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  isDarkMode.value = mediaQuery.matches
  mediaQuery.addEventListener('change', (e) => {
    isDarkMode.value = e.matches
  })
})

async function handleModalX() {
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
    console.log(error)
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
    getData(startDate, endDate)
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
    console.log(error)
  }
}
</script>

<style>
@import '~/../node_modules/vue-simple-calendar/dist/vue-simple-calendar.css';

/* ========================================
   Watercolor Calendar Theme
   ======================================== */

.wc-calendar-container {
  display: flex;
  flex-flow: column;
  height: 100%;
  width: 100%;
  padding: 1rem;
}

.wc-calendar-wrapper {
  font-family: 'Quicksand', sans-serif;
  color: var(--wc-charcoal);
  width: 100%;
  margin-left: auto;
  margin-right: auto;
  flex: 1 1 auto;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border-radius: 24px;
  border: 1px solid rgba(248, 187, 217, 0.3);
  box-shadow: 0 10px 40px -10px rgba(248, 187, 217, 0.25);
  overflow: hidden;
}

/* Calendar header */
.wc-calendar .cv-header {
  background: linear-gradient(135deg, var(--wc-rose-light) 0%, var(--wc-sky-light) 100%);
  border-bottom: 1px solid rgba(248, 187, 217, 0.3);
  padding: 1rem;
}

.wc-calendar .cv-header .periodLabel {
  font-family: 'Cormorant Garamond', serif;
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--wc-charcoal);
}

.wc-calendar .cv-header button {
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(248, 187, 217, 0.3);
  border-radius: 12px;
  color: var(--wc-charcoal);
  font-family: 'Quicksand', sans-serif;
  font-weight: 500;
  padding: 0.5rem 1rem;
  transition: all 0.3s ease;
}

.wc-calendar .cv-header button:hover {
  background: var(--wc-rose-light);
  border-color: var(--wc-rose);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px -3px rgba(248, 187, 217, 0.4);
}

.wc-calendar .cv-header button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* Day headers */
.wc-calendar .cv-header-day {
  background: linear-gradient(180deg, var(--wc-cream) 0%, var(--wc-paper) 100%);
  color: var(--wc-charcoal);
  font-family: 'Quicksand', sans-serif;
  font-weight: 600;
  font-size: 0.85rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid rgba(248, 187, 217, 0.2);
}

/* Calendar days */
.wc-calendar .cv-day {
  background: var(--wc-cream);
  border: 1px solid rgba(248, 187, 217, 0.15);
  transition: all 0.3s ease;
}

.wc-calendar .cv-day:hover {
  background: var(--wc-rose-light);
}

.wc-calendar .cv-day.past {
  background: var(--wc-paper);
  opacity: 0.7;
}

.wc-calendar .cv-day.outsideOfMonth {
  background: rgba(245, 243, 239, 0.5);
  opacity: 0.5;
}

.wc-calendar .cv-day.today {
  background: linear-gradient(135deg, var(--wc-sky-light) 0%, var(--wc-mint-light) 100%);
  box-shadow: inset 0 0 0 2px var(--wc-sky-medium);
}

.wc-calendar .cv-day[aria-selected='true'] {
  background: var(--wc-lavender-light);
  box-shadow: inset 0 0 0 2px var(--wc-lavender);
}

/* Day number */
.wc-calendar .cv-day-number {
  font-family: 'Quicksand', sans-serif;
  font-weight: 600;
  color: var(--wc-charcoal);
}

.wc-calendar .cv-day.today .cv-day-number {
  color: var(--wc-sky-dark);
}

/* Week numbers */
.wc-calendar .cv-weeknumber {
  background: var(--wc-paper);
  border-color: rgba(248, 187, 217, 0.2);
  color: var(--wc-charcoal-light);
  font-family: 'Quicksand', sans-serif;
  font-size: 0.75rem;
}

/* Calendar items (events) */
.wc-calendar .cv-item {
  border-radius: 8px;
  border: none;
  font-family: 'Quicksand', sans-serif;
  font-weight: 500;
  font-size: 0.8rem;
  padding: 0.25rem 0.5rem;
  box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.15);
  transition: all 0.2s ease;
  cursor: pointer;
}

.wc-calendar .cv-item:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px -3px rgba(0, 0, 0, 0.2);
}

.wc-calendar .cv-item .startTime,
.wc-calendar .cv-item .endTime {
  font-size: 0.7rem;
  opacity: 0.8;
}

/* Event details table */
.wc-event-table {
  text-align: left;
  vertical-align: top;
  width: 100%;
  font-family: 'Quicksand', sans-serif;
  color: var(--wc-charcoal);
}

.wc-event-table th {
  padding-right: 1rem;
  padding-bottom: 0.5rem;
  font-weight: 600;
  color: var(--wc-rose-dark);
  white-space: nowrap;
}

.wc-event-table td {
  padding-bottom: 0.5rem;
}

.wc-event-description {
  margin-top: 1rem;
  padding: 1rem;
  background: var(--wc-paper);
  border-radius: 12px;
  font-family: 'Quicksand', sans-serif;
  font-size: 0.9rem;
  white-space: pre-wrap;
  color: var(--wc-charcoal);
  border: 1px solid rgba(248, 187, 217, 0.2);
}

/* Hide year navigation on mobile */
.wc-calendar .previousYear,
.wc-calendar .nextYear {
  display: none;
}

@media (width <= 480px) {
  .wc-calendar .periodLabel {
    font-size: 1.25rem !important;
  }
}

/* ========================================
   Dark Mode
   ======================================== */
@media (prefers-color-scheme: dark) {
  .wc-calendar-wrapper {
    background: rgba(37, 37, 61, 0.8);
    border-color: rgba(206, 147, 216, 0.2);
    box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.4);
  }

  .wc-calendar .cv-header {
    background: linear-gradient(135deg, rgba(244, 143, 177, 0.15) 0%, rgba(144, 202, 249, 0.15) 100%);
    border-bottom-color: rgba(206, 147, 216, 0.2);
  }

  .wc-calendar .cv-header .periodLabel {
    color: var(--wc-dark-text);
  }

  .wc-calendar .cv-header button {
    background: rgba(45, 45, 74, 0.8);
    border-color: rgba(206, 147, 216, 0.2);
    color: var(--wc-dark-text);
  }

  .wc-calendar .cv-header button:hover {
    background: rgba(206, 147, 216, 0.2);
    border-color: var(--wc-dark-lavender);
  }

  .wc-calendar .cv-header-day {
    background: linear-gradient(180deg, var(--wc-dark-surface) 0%, var(--wc-dark-bg) 100%);
    color: var(--wc-dark-text);
    border-bottom-color: rgba(206, 147, 216, 0.15);
  }

  .wc-calendar .cv-day {
    background: var(--wc-dark-bg);
    border-color: rgba(206, 147, 216, 0.1);
  }

  .wc-calendar .cv-day:hover {
    background: var(--wc-dark-surface);
  }

  .wc-calendar .cv-day.past {
    background: rgba(26, 26, 46, 0.8);
  }

  .wc-calendar .cv-day.outsideOfMonth {
    background: rgba(15, 15, 30, 0.6);
  }

  .wc-calendar .cv-day.today {
    background: linear-gradient(135deg, rgba(144, 202, 249, 0.2) 0%, rgba(165, 214, 167, 0.2) 100%);
    box-shadow: inset 0 0 0 2px var(--wc-dark-sky);
  }

  .wc-calendar .cv-day[aria-selected='true'] {
    background: rgba(206, 147, 216, 0.2);
    box-shadow: inset 0 0 0 2px var(--wc-dark-lavender);
  }

  .wc-calendar .cv-day-number {
    color: var(--wc-dark-text);
  }

  .wc-calendar .cv-day.today .cv-day-number {
    color: var(--wc-dark-sky);
  }

  .wc-calendar .cv-weeknumber {
    background: var(--wc-dark-surface);
    border-color: rgba(206, 147, 216, 0.15);
    color: var(--wc-dark-text-muted);
  }

  .wc-calendar .cv-item {
    box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.3);
  }

  .wc-event-table {
    color: var(--wc-dark-text);
  }

  .wc-event-table th {
    color: var(--wc-dark-lavender);
  }

  .wc-event-description {
    background: var(--wc-dark-surface);
    color: var(--wc-dark-text);
    border-color: rgba(206, 147, 216, 0.15);
  }
}
</style>
