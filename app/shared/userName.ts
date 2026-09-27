/**
 * The name to address a user by throughout the app — the menu greeting and the
 * email salutations: the first whitespace-separated part of their display name.
 * Returns an empty string when there is no usable name (callers fall back to a
 * generic greeting or the email address).
 */
export function firstNameOf(displayName: string | null | undefined): string {
  const name = (displayName ?? '').trim()
  if (!name) return ''
  // Non-empty and trimmed, so `split` yields at least one non-empty part — the
  // assertion is for the type checker, not a case that can occur.
  return name.split(/\s+/)[0]!
}
