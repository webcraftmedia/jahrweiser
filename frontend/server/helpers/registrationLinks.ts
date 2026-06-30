import ICAL from 'ical.js'

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
}): ICAL.Component {
  const vcard = new ICAL.Component('vcard')
  vcard.addPropertyWithValue('version', '4.0')
  vcard.addPropertyWithValue('uid', input.uid)
  vcard.addPropertyWithValue('fn', `${input.firstName} ${input.lastName}`.trim())
  const n = new ICAL.Property('n', vcard)
  n.setValue([input.lastName, input.firstName, '', '', ''])
  vcard.addProperty(n)
  vcard.addPropertyWithValue('email', input.email)
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
