/**
 * How long ago a member was last active, coarsened to a handful of spans.
 *
 * The admin overview needs "how big is the active core, how many have drifted
 * off" — a question about the whole membership. Coarse spans answer it without
 * turning anybody's timestamps into a daily rhythm. Rolling windows rather than
 * calendar days, so the spans line up with the 1/7/30-day counts the daily
 * snapshot records (see `activeCounts`).
 *
 * In `shared/` because the client needs the order and the keys for its labels;
 * the bucketing itself runs on the server, which never sends the timestamps.
 */

export const ACTIVITY_BUCKETS = ['day', 'week', 'month', 'quarter', 'older', 'never'] as const

export type ActivityBucket = (typeof ACTIVITY_BUCKETS)[number]

export type ActivityCounts = Record<ActivityBucket, number>

const DAY_MS = 24 * 60 * 60 * 1000

/** Upper bound of each span in days; `older` and `never` have none. */
const SPAN_DAYS: [ActivityBucket, number][] = [
  ['day', 1],
  ['week', 7],
  ['month', 30],
  ['quarter', 90],
]

/** The span a single last-seen moment falls into. */
export function activityBucket(lastSeen: Date | null, now: Date): ActivityBucket {
  if (lastSeen === null) return 'never'
  const age = now.getTime() - lastSeen.getTime()
  return SPAN_DAYS.find(([, days]) => age <= days * DAY_MS)?.[0] ?? 'older'
}

/** How many members fall into each span, every span present even when empty. */
export function countActivity(lastSeen: (Date | null)[], now: Date): ActivityCounts {
  const counts = Object.fromEntries(ACTIVITY_BUCKETS.map((key) => [key, 0])) as ActivityCounts
  for (const moment of lastSeen) {
    counts[activityBucket(moment, now)] += 1
  }
  return counts
}

/**
 * The cumulative figures the daily snapshot keeps: active within the last 1,
 * 7 and 30 days. Cumulative, not per span — "active this month" includes
 * whoever was active today, which is what the number means when read aloud.
 */
export function activeCounts(counts: ActivityCounts): {
  active1d: number
  active7d: number
  active30d: number
} {
  return {
    active1d: counts.day,
    active7d: counts.day + counts.week,
    active30d: counts.day + counts.week + counts.month,
  }
}
