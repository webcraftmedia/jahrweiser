/**
 * What a member looks like in a list an admin may scroll through.
 *
 * Both helpers run **server-side**, before the row is serialised. Masking in a
 * Vue template would be theatre: the unmasked value would still be in the
 * response, one glance at the network tab away, and the members' directory
 * would be one request from being harvested wholesale. They live in `shared/`
 * because the client needs the same rules for the odd label it builds itself —
 * not because the client is allowed to receive the originals.
 *
 * The bargain: recognisable enough that an admin can tell two members apart,
 * useless for collecting addresses. Anyone who already knows an address can
 * still look it up — see the exact-match search in
 * `server/api/admin/members/list.get.ts`.
 */

/** Three dots that are one character, so a mask is never mistaken for input. */
const ELLIPSIS = '•••'

/**
 * `Anna Mustermann` → `Anna M.`
 *
 * The surname is the last whitespace-separated part, so `Anna Maria
 * Mustermann` still abbreviates to the M of Mustermann rather than of Maria.
 * A single name stays whole: shortening `Anna` to `A.` would name nobody.
 */
export function abbreviateName(displayName: string | null | undefined): string {
  const name = (displayName ?? '').trim().replace(/\s+/g, ' ')
  if (!name) return ''

  const parts = name.split(' ')
  if (parts.length === 1) return name

  const surname = parts[parts.length - 1]!
  const given = parts.slice(0, -1).join(' ')
  // `[...surname]` rather than `surname[0]`: a name may begin with a character
  // outside the basic plane, and half a code point is not an initial.
  const initial = [...surname][0] ?? ''
  return initial ? `${given} ${initial}.` : given
}

/**
 * `anna.mustermann@example.de` → `an•••@ex•••.de`
 *
 * Two characters of the local part and two of the domain, with the top-level
 * domain left alone. Enough that an admin recognises the row they were just
 * looking at; not enough to reconstruct an address, and not enough to confirm
 * a guessed one — that is what the local part being cut at two characters is
 * for.
 *
 * Anything that is not an address comes back fully masked rather than passed
 * through: a value that reached this function is meant to be hidden, and
 * guessing at its shape is how originals leak.
 */
export function maskEmail(email: string | null | undefined): string {
  const value = (email ?? '').trim()
  const at = value.lastIndexOf('@')
  if (at < 1 || at === value.length - 1) return ELLIPSIS

  const local = value.slice(0, at)
  const domain = value.slice(at + 1)

  const dot = domain.lastIndexOf('.')
  // A domain without a dot (an intranet host) keeps no visible suffix — there
  // is nothing to leave alone, and inventing one would be a lie.
  const host = dot > 0 ? domain.slice(0, dot) : domain
  const tld = dot > 0 ? domain.slice(dot) : ''

  return `${head(local)}${ELLIPSIS}@${head(host)}${ELLIPSIS}${tld}`
}

/** The first two characters of a part, or fewer if that is all there is. */
function head(part: string): string {
  return [...part].slice(0, 2).join('')
}
