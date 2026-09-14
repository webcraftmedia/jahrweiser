// In-process record of when a login link was last requested for an address.
//
// It exists to make the cooldown *reportable*. The authoritative gate is the
// `login_tokens.requested_at` lookup in requestLoginLink — but that one can
// only fire for an address that has a user, so answering "you are in the
// cooldown" from it alone would tell an attacker which addresses are members.
// This map is fed by every request, known address or not, so the answer
// carries no information about who exists.
//
// Per-process, like the negative cache next door, and for the same reason: the
// window is a minute, so a restart or a second instance costs at most one
// extra mail.
const lastRequestedAt = new Map<string, number>()

/**
 * Whether `email` (normalized) asked for a link less than `windowMs` ago.
 * Lazily evicts, so the map cannot grow past the addresses seen in one window.
 */
export function isWithinLoginCooldown(email: string, windowMs: number): boolean {
  const ts = lastRequestedAt.get(email)
  if (ts === undefined) return false
  if (Date.now() - ts >= windowMs) {
    lastRequestedAt.delete(email)
    return false
  }
  return true
}

/** Start the cooldown for `email`. Called for every request that gets past it. */
export function markLoginRequested(email: string): void {
  lastRequestedAt.set(email, Date.now())
}
