import ICAL from 'ical.js'

import { createCardDAVAccount, findUserByEmail, readAdminTags } from './dav'

import type { DAV_CONFIG } from './dav'

// Selectable validity presets shown to admins when creating a link. Values are
// the number of days until expiry; `null` means the link never expires.
export const LINK_DURATIONS = {
  '1d': 1,
  '7d': 7,
  '30d': 30,
  unlimited: null,
} as const

export type LinkDuration = keyof typeof LINK_DURATIONS

export const LINK_DURATION_KEYS = Object.keys(LINK_DURATIONS) as LinkDuration[]

/** Absolute expiry for a chosen duration preset, or `null` for unlimited. */
export function computeExpiresAt(duration: LinkDuration, now: number): Date | null {
  const days = LINK_DURATIONS[duration]
  if (days === null) return null
  return new Date(now + days * 24 * 60 * 60 * 1000)
}

/**
 * Owner gate for the mutating link actions. Viewing and deactivating a link stay
 * open to every admin, but editing, deleting and reactivating are reserved for
 * the admin who created it. Throws 404 when the link is gone (so a stale token
 * can't probe other rows) and 403 when a different admin owns it.
 */
export function assertLinkOwner(createdByUid: string | undefined, uid: string): void {
  if (createdByUid === undefined) {
    throw createError({ statusCode: 404, statusMessage: 'Link not found' })
  }
  if (createdByUid !== uid) {
    throw createError({ statusCode: 403, statusMessage: 'Not Authorized' })
  }
}

/**
 * The calendars an admin may bind a registration link to: their own
 * X-ADMIN-TAGS, read from DAV. Mirrors the gate in
 * server/api/admin/updateUserTags.post.ts — a link must never be able to grant
 * access its creator cannot grant directly.
 */
export async function findGrantableCalendars(
  config: DAV_CONFIG,
  adminEmail: string,
): Promise<string[]> {
  const adminQuery = await findUserByEmail(createCardDAVAccount(config), adminEmail)
  if (!adminQuery) {
    throw createError({ statusCode: 403, statusMessage: 'Admin account not found' })
  }
  return readAdminTags(adminQuery.vcard)
}

/**
 * Narrow a requested calendar binding to what the admin may actually grant.
 * Unknown names are dropped rather than rejected, matching how
 * updateUserTags.post.ts filters its input.
 *
 * @returns null for "no binding" — an empty selection is stored as NULL, not as
 * an empty array, so the two cannot drift apart in the UI or in queries.
 */
export function narrowCalendarBinding(
  requested: string[] | undefined,
  grantable: string[],
): string[] | null {
  if (!requested) return null
  const allowed = requested.filter((name) => grantable.includes(name))
  return allowed.length > 0 ? allowed : null
}

export type LinkStatus = 'valid' | 'revoked' | 'expired' | 'exhausted'

/**
 * Whether a link can still be used. Order matters: an admin's explicit revoke
 * takes precedence over a not-yet-reached expiry, and expiry over the use cap.
 */
export function linkStatus(
  link: { revokedAt: Date | null; expiresAt: Date | null; maxUses: number | null },
  useCount: number,
  now: number,
): LinkStatus {
  if (link.revokedAt !== null) return 'revoked'
  if (link.expiresAt !== null && link.expiresAt.getTime() <= now) return 'expired'
  if (link.maxUses !== null && useCount >= link.maxUses) return 'exhausted'
  return 'valid'
}

/**
 * Build a vCard for a self-registered user. DAV stays the source of truth for
 * contact data, so we set what the sync/login path reads back: a UID we
 * generate ourselves (stable sidecar key — we don't trust the DAV server to
 * assign one), FN (the displayName the app shows) and EMAIL. N carries the
 * structured name for native DAV clients. ical.js handles vCard escaping of
 * commas/semicolons in the name parts.
 */
export function buildRegistrantVCard(input: {
  uid: string
  firstName: string
  lastName: string
  email: string
  /** Calendar binding of the link, granted as CATEGORIES. */
  calendars?: string[] | null
}): ICAL.Component {
  const vcard = new ICAL.Component('vcard')
  vcard.addPropertyWithValue('version', '4.0')
  vcard.addPropertyWithValue('uid', input.uid)
  vcard.addPropertyWithValue('fn', `${input.firstName} ${input.lastName}`.trim())
  const n = new ICAL.Property('n', vcard)
  n.setValue([input.lastName, input.firstName, '', '', ''])
  vcard.addProperty(n)
  vcard.addPropertyWithValue('email', input.email)
  if (input.calendars?.length) {
    vcard.addPropertyWithValue('categories', '')
    vcard.getFirstProperty('categories')!.setValues(input.calendars)
  }
  return vcard
}

/**
 * Fill in missing identity fields on an existing vCard when someone re-registers:
 * a UID (so the sidecar can key it) and the name (FN + structured N). Only fills
 * what is absent — never overwrites a name the user already has. Returns whether
 * the vCard was mutated, so the caller can skip a DAV write when nothing changed.
 */
export function fillMissingRegistrantData(
  vcard: ICAL.Component,
  input: { uid: string; firstName: string; lastName: string },
): boolean {
  let mutated = false
  if (!vcard.getFirstPropertyValue('uid')?.toString().trim()) {
    vcard.updatePropertyWithValue('uid', input.uid)
    mutated = true
  }
  if (!vcard.getFirstPropertyValue('fn')?.toString().trim()) {
    vcard.updatePropertyWithValue('fn', `${input.firstName} ${input.lastName}`.trim())
    if (!vcard.getFirstProperty('n')) {
      const n = new ICAL.Property('n', vcard)
      n.setValue([input.lastName, input.firstName, '', '', ''])
      vcard.addProperty(n)
    }
    mutated = true
  }
  return mutated
}
