/**
 * The name to address a user by throughout the app — the menu greeting and the
 * email salutations: the first whitespace-separated part of their display name.
 * Returns an empty string when there is no usable name (callers fall back to a
 * generic greeting or the email address).
 */
export function firstNameOf(displayName: string | null | undefined): string {
  const name = (displayName ?? '').trim()
  if (!name) return ''
  return name.split(/\s+/)[0] ?? ''
}
