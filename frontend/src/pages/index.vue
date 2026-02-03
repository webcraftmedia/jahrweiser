<template>
  <div class="box">
    <div class="calendar row">
      <client-only>
        <CalendarView v-bind="calendar" class="theme-sketchy" @click-item="clickItem">
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
          <table class="event-table">
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
          <pre class="event-description">{{
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
  const color = hex.replace('#', '')
  const r = parseInt(color.substring(0, 2), 16)
  const g = parseInt(color.substring(2, 4), 16)
  const b = parseInt(color.substring(4, 6), 16)
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
  startingDayOfWeek: 1,
  disablePast: false,
  disableFuture: false,
  displayPeriodUom: 'month',
  displayPeriodCount: 1,
  displayWeekNumbers: false,
  showTimes: false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  periodChangedCallback: (data: any) => {
    const startDate = data.value.displayFirstDate.value
    const endDate = data.value.displayLastDate.value
    getData(startDate, endDate)
  },
})

function setShowDate(d: Date) {
  calendar.value.showDate = d
}

async function getData(startDate: Date, endDate: Date) {
  try {
    if (calendars.value.length === 0) {
      calendars.value = await $fetch('/api/calendars')
    }

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

    rawItems.value = results.flat()
  } catch (error) {
    console.log(error)
  }
}
</script>

<style>
@import '~/../node_modules/vue-simple-calendar/dist/vue-simple-calendar.css';

/* Sketchy Calendar Theme */
.box {
  display: flex;
  flex-flow: column;
  height: 100%;
  width: 100%;
}

.calendar {
  font-family: 'Patrick Hand', cursive;
  color: var(--ink-dark);
  width: 100%;
  margin-left: auto;
  margin-right: auto;
  flex: 1 1 auto;
}

.event-table {
  text-align: left;
  vertical-align: top;
  font-family: 'Patrick Hand', cursive;
}

.event-table th {
  padding-right: 1rem;
  font-weight: 600;
  color: var(--ink-blue);
}

.event-table td {
  color: var(--ink-dark);
}

.event-description {
  text-align: left;
  white-space: pre-wrap;
  font-family: 'Kalam', cursive;
  font-size: 1rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px dashed var(--ink-dark);
  opacity: 0.9;
}

/* Sketchy Calendar Styles */
.theme-sketchy .cv-wrapper {
  background-color: var(--paper-light);
  border: 2px solid var(--ink-dark);
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  box-shadow: 4px 4px 0 rgba(44, 36, 22, 0.2);
  overflow: hidden;
}

.theme-sketchy .cv-header {
  background-color: var(--paper-light);
  border-bottom: 2px solid var(--ink-dark);
  padding: 0.75rem;
}

.theme-sketchy .cv-header .periodLabel {
  font-family: 'Caveat', cursive;
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--ink-dark);
}

.theme-sketchy .cv-header button {
  font-family: 'Patrick Hand', cursive;
  font-size: 1rem;
  color: var(--ink-blue);
  background-color: transparent;
  border: 2px solid var(--ink-blue);
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  padding: 0.25rem 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.theme-sketchy .cv-header button:hover {
  background-color: var(--ink-blue);
  color: var(--ink-light);
  transform: translateY(-1px) rotate(-1deg);
}

.theme-sketchy .cv-header button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.theme-sketchy .cv-header-day {
  font-family: 'Caveat', cursive;
  font-size: 1.1rem;
  font-weight: 500;
  color: var(--ink-dark);
  background-color: rgba(201, 162, 39, 0.15);
  border-bottom: 1px solid var(--paper-lines);
  padding: 0.5rem;
}

.theme-sketchy .cv-weeknumber {
  font-family: 'Kalam', cursive;
  background-color: rgba(135, 168, 120, 0.2);
  border-color: var(--paper-lines);
  color: var(--ink-green);
  font-size: 0.9rem;
}

.theme-sketchy .cv-day {
  background-color: var(--paper-light);
  border-color: var(--paper-lines);
  min-height: 80px;
  transition: background-color 0.2s ease;
}

.theme-sketchy .cv-day:hover {
  background-color: rgba(74, 111, 165, 0.05);
}

.theme-sketchy .cv-day.past {
  background-color: rgba(44, 36, 22, 0.03);
}

.theme-sketchy .cv-day.outsideOfMonth {
  background-color: rgba(44, 36, 22, 0.08);
}

.theme-sketchy .cv-day.today {
  background-color: rgba(74, 111, 165, 0.15);
  border: 2px solid var(--ink-blue);
}

.theme-sketchy .cv-day[aria-selected='true'] {
  background-color: rgba(198, 123, 92, 0.2);
}

.theme-sketchy .cv-day-number {
  font-family: 'Caveat', cursive;
  font-size: 1.25rem;
  font-weight: 500;
  color: var(--ink-dark);
  padding: 0.25rem 0.5rem;
}

.theme-sketchy .cv-day.today .cv-day-number {
  color: var(--ink-blue);
  font-weight: 700;
}

/* Event Items */
.theme-sketchy .cv-item {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.95rem;
  border: 1px solid rgba(44, 36, 22, 0.3);
  border-radius: 4px;
  padding: 0.15rem 0.4rem;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 1px 1px 0 rgba(44, 36, 22, 0.15);
}

.theme-sketchy .cv-item:hover {
  transform: translateY(-1px) rotate(-0.5deg);
  box-shadow: 2px 2px 0 rgba(44, 36, 22, 0.2);
  z-index: 10;
}

.theme-sketchy .cv-item .startTime,
.theme-sketchy .cv-item .endTime {
  font-family: 'Kalam', cursive;
  font-size: 0.85rem;
  opacity: 0.8;
}

/* Hide year navigation on small screens */
.previousYear,
.nextYear {
  display: none;
}

@media (width <= 480px) {
  .theme-sketchy .cv-header .periodLabel {
    font-size: 1.25rem !important;
  }

  .theme-sketchy .cv-header button {
    font-size: 0.85rem;
    padding: 0.2rem 0.5rem;
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .calendar {
    color: var(--ink-light);
  }

  .event-table td {
    color: var(--ink-light);
  }

  .event-table th {
    color: var(--ink-blue-dark);
  }

  .event-description {
    border-top-color: var(--ink-light);
  }

  .theme-sketchy .cv-wrapper {
    background-color: var(--paper-dark);
    border-color: var(--ink-light);
    box-shadow: 4px 4px 0 rgba(245, 240, 230, 0.1);
  }

  .theme-sketchy .cv-header {
    background-color: var(--paper-dark);
    border-bottom-color: var(--ink-light);
  }

  .theme-sketchy .cv-header .periodLabel {
    color: var(--ink-light);
  }

  .theme-sketchy .cv-header button {
    color: var(--ink-blue-dark);
    border-color: var(--ink-blue-dark);
  }

  .theme-sketchy .cv-header button:hover {
    background-color: var(--ink-blue-dark);
    color: var(--paper-dark);
  }

  .theme-sketchy .cv-header button:disabled {
    color: rgba(245, 240, 230, 0.3);
    border-color: rgba(245, 240, 230, 0.3);
  }

  .theme-sketchy .cv-header-day {
    color: var(--ink-light);
    background-color: rgba(233, 194, 71, 0.1);
    border-bottom-color: var(--paper-lines-dark);
  }

  .theme-sketchy .cv-weeknumber {
    background-color: rgba(167, 200, 152, 0.15);
    border-color: var(--paper-lines-dark);
    color: var(--ink-green-dark);
  }

  .theme-sketchy .cv-day {
    background-color: var(--paper-dark);
    border-color: var(--paper-lines-dark);
  }

  .theme-sketchy .cv-day:hover {
    background-color: rgba(106, 143, 197, 0.1);
  }

  .theme-sketchy .cv-day.past {
    background-color: rgba(245, 240, 230, 0.02);
  }

  .theme-sketchy .cv-day.outsideOfMonth {
    background-color: rgba(0, 0, 0, 0.2);
  }

  .theme-sketchy .cv-day.today {
    background-color: rgba(106, 143, 197, 0.2);
    border-color: var(--ink-blue-dark);
  }

  .theme-sketchy .cv-day[aria-selected='true'] {
    background-color: rgba(230, 155, 124, 0.2);
  }

  .theme-sketchy .cv-day-number {
    color: var(--ink-light);
  }

  .theme-sketchy .cv-day.today .cv-day-number {
    color: var(--ink-blue-dark);
  }

  .theme-sketchy .cv-item {
    border-color: rgba(245, 240, 230, 0.3);
    box-shadow: 1px 1px 0 rgba(0, 0, 0, 0.3);
  }

  .theme-sketchy .cv-item:hover {
    box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.4);
  }

  .theme-sketchy .cv-item .startTime,
  .theme-sketchy .cv-item .endTime {
    color: rgba(245, 240, 230, 0.7);
  }
}
</style>
