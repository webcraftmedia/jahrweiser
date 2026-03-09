const legend = ref<{ name: string; dotColor: string }[]>([])
const hiddenCalendars = ref(new Set<string>())

export function useCalendarFilter() {
  function setLegend(items: { name: string; dotColor: string }[]) {
    legend.value = items
  }

  function toggleCalendar(name: string) {
    const s = new Set(hiddenCalendars.value)
    if (s.has(name)) s.delete(name)
    else s.add(name)
    hiddenCalendars.value = s
  }

  return {
    legend: readonly(legend),
    hiddenCalendars: readonly(hiddenCalendars),
    setLegend,
    toggleCalendar,
  }
}
