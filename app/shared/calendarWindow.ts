/**
 * How far back the calendar reaches: the current month and the one before it.
 *
 * One definition for the three places that must agree — the server, which
 * answers anything older with an empty list (server/api/calendar.post.ts), the
 * calendar page, which hides the "previous" button at that month
 * (src/pages/index.vue), and the installed app's offline copy, which must never
 * keep more of the past than the member may see online
 * (src/utils/offlineData.ts).
 */

/** Months before the current one that can still be opened. */
export const PAST_MONTHS = 1

/**
 * The month grid starts on the Monday before the 1st, so a request for the
 * earliest month may begin up to a week earlier.
 */
const GRID_LEAD_DAYS = 7

/** The earliest month that can be shown, 1-based. */
export function earliestVisibleMonth(now: Date): { year: number; month: number } {
  const first = new Date(now.getFullYear(), now.getMonth() - PAST_MONTHS, 1)
  return { year: first.getFullYear(), month: first.getMonth() + 1 }
}

/** The earliest moment a calendar request may cover. */
export function earliestVisibleDate(now: Date): Date {
  const { year, month } = earliestVisibleMonth(now)
  const first = new Date(year, month - 1, 1)
  return new Date(first.getTime() - GRID_LEAD_DAYS * 24 * 60 * 60 * 1000)
}
