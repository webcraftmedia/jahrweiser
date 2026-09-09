/**
 * A Telegram invitation as it reaches the client.
 *
 * Shared by /telegram (which offers the links), the icon rail (which hides its
 * entry when there are none) and the admin page (which edits them).
 */
export interface TelegramChannel {
  id: number
  name: string
  description?: string
  url: string
  /** Only a label for the reader; it has no effect on how the link is used. */
  public: boolean
}

/**
 * Every Telegram invitation is a plain https://t.me/… link, whether it points
 * at a public channel (`/name`), a private invite (`/+hash`) or the legacy
 * form (`/joinchat/hash`) — no type distinction is needed to open them.
 */
export const TELEGRAM_URL_PREFIX = 'https://t.me/'

/**
 * Guards against a typo turning the channel list into an open-redirect surface.
 * Used on the server (as a zod refinement) and in the admin form, so the same
 * rule decides what may be saved and what the form complains about.
 */
export function isTelegramUrl(value: string): boolean {
  return value.startsWith(TELEGRAM_URL_PREFIX) && value.length > TELEGRAM_URL_PREFIX.length
}

/** Column widths from server/db/schema/telegram-channels.ts, for the form. */
export const TELEGRAM_NAME_MAX = 255
export const TELEGRAM_DESCRIPTION_MAX = 500
export const TELEGRAM_URL_MAX = 500
