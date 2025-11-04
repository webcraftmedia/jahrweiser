<template>
  <div class="box">
    <div class="content row">
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
          <table class="text-left align-top">
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
              <tr></tr>
            </tbody>
          </table>
          <pre class="text-left whitespace-pre-wrap">{{
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

const items = ref<ICalendarItem[]>([])
const event = ref()

async function handleModalX() {
  modal.value.close()
}

async function clickItem(data: INormalizedCalendarItem) {
  try {
    const {
      originalItem: { id, occurrence },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } = data as any
    const eventDate = await $fetch('/api/event', {
      method: 'POST',
      body: {
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
    items.value = await $fetch('/api/calendar', {
      method: 'POST',
      body: {
        startDate,
        endDate,
      },
    })
  } catch (error) {
    console.log(error)
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
.content {
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  color: #2c3e50;
  width: 100%;
  margin-left: auto;
  margin-right: auto;
  flex: 1 1 auto;
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
</style>
