// What the feedback form sends and what the endpoint accepts — one definition,
// so the textarea's `maxlength` and the server's validation cannot drift apart.

/** Feedback or a bug report; the mail says which, and is subjected accordingly. */
export const FEEDBACK_KINDS = ['feedback', 'bug'] as const
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

export type FeedbackRequest =
  { kind: 'feedback'; message: string } | { kind: 'bug'; message: string; context: FeedbackContext }
