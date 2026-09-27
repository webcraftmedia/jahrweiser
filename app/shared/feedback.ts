// What the feedback form sends and what the endpoint accepts — one definition,
// so the textarea's `maxlength` and the server's validation cannot drift apart.

/**
 * Feedback, a bug report or a suggested event; the mail says which, and is
 * subjected accordingly.
 */
export const FEEDBACK_KINDS = ['feedback', 'bug', 'event'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

/** Long enough for a detailed bug report, short enough to stay a mail. */
export const FEEDBACK_MESSAGE_MAX = 5000
/** Every context field is a short label; anything longer is not one. */
export const FEEDBACK_FIELD_MAX = 300

/**
 * The technical context that travels with a *bug report*.
 *
 * Only with a bug report: an idea or a compliment is not reproduced, so the
 * browser, the window size and the page are data with no purpose there — and
 * data with no purpose is data not collected.
 *
 * Collected in the browser and *shown to the member before they send* — the
 * form lists every one of these values. Nothing here is gathered behind their
 * back, which is also why the server takes the client's word for it instead of
 * reading the request headers: what is sent is what was displayed.
 */
export interface FeedbackContext {
  /** In-app route the member came from — what the report is about. */
  page: string
  /** `runtimeConfig.public.appVersion` of the client that sent it. */
  appVersion: string
  /** `navigator.userAgent` — browser and OS, for "works here, not there". */
  userAgent: string
  /** Window size as `1280×800`, the other half of a layout bug. */
  viewport: string
  /** Light or dark mode, as the member had it. */
  colorScheme: string
}

/**
 * Exactly what `<input type="datetime-local">` produces: `2026-10-05T19:30`.
 *
 * Wall-clock time without a zone, and it stays that way all the way into the
 * mail. Running it through `new Date()` on the server would read it as UTC (or
 * as the server's zone, depending on the format) and move the suggested event
 * by the offset — a 19:30 rehearsal announced for 21:30. Nothing downstream
 * parses these strings; they are reformatted textually.
 *
 * The fixed width has a second use: two of these compare correctly with `<`,
 * so "end before start" needs no date arithmetic anywhere.
 */
export const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/**
 * A member's suggestion for the community calendar.
 *
 * Nobody writes to the calendar from here — the suggestion is a mail to the
 * team, who decide and enter it. That is why this carries no calendar id and
 * no recurrence: it is a proposal in a mail, not an event.
 */
export interface FeedbackEvent {
  /** What the entry would be called. Required — a time without a name is not a suggestion. */
  title: string
  /** Start as local wall-clock time, see {@link LOCAL_DATE_TIME_PATTERN}. */
  start: string
  /** End, never before `start`. */
  end: string
  /** Where it happens; may be empty, not every suggestion has a place yet. */
  location: string
}

export type FeedbackRequest =
  | { kind: 'feedback'; message: string }
  | { kind: 'bug'; message: string; context: FeedbackContext }
  // The description is the optional part here: title and time carry the
  // suggestion, an explanation is welcome but not required.
  | { kind: 'event'; message: string; event: FeedbackEvent }

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * `2026-10-05T19:30` → `05.10.2026, 19:30`, for the mail to the team.
 *
 * German-only, like the rest of the mail templates (the endpoint renders them
 * with a fixed `locale: 'de'`). Pure string work — see
 * {@link LOCAL_DATE_TIME_PATTERN} for why no `Date` is involved.
 */
export function formatLocalDateTime(value: string): string {
  if (!LOCAL_DATE_TIME_PATTERN.test(value)) return value
  const [date, time] = value.split('T') as [string, string]
  const [year, month, day] = date.split('-') as [string, string, string]
  return `${day}.${month}.${year}, ${time}`
}

/**
 * Moves a local date-time by whole hours, rolling days and months over.
 *
 * Used for the form's default end time. `Date.UTC` is arithmetic on the given
 * wall-clock fields and nothing else: a local `Date` would apply the browser's
 * DST rules and turn "two hours later" into one or three on two nights a year.
 */
export function shiftLocalDateTime(value: string, hours: number): string {
  if (!LOCAL_DATE_TIME_PATTERN.test(value)) return value
  const [date, time] = value.split('T') as [string, string]
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const [hour, minute] = time.split(':').map(Number) as [number, number]
  const shifted = new Date(Date.UTC(year, month - 1, day, hour + hours, minute))
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
  )
}
