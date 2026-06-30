import ICAL from 'ical.js'

// Contact-name utilities shared by the profile endpoints. DAV is the source of
// truth for the name: the structured `N` property (Family;Given;…) carries the
// first/last split, while `FN` is the human-readable display name the app shows.

/** Best-effort split of a display name into first/last on the first space. */
export function splitDisplayName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim()
  if (!trimmed) return { firstName: '', lastName: '' }
  const idx = trimmed.indexOf(' ')
  if (idx === -1) return { firstName: trimmed, lastName: '' }
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1).trim() }
}

/**
 * Read first/last name from a vCard, preferring the structured `N` (given +
 * family) and falling back to splitting `FN` when `N` is absent or empty.
 */
export function readVCardName(vcard: ICAL.Component): { firstName: string; lastName: string } {
  // Structured N is [Family, Given, …]. Absent N → empty components, which
  // falls through to splitting FN below.
  const value = vcard.getFirstProperty('n')?.getValues()[0]
  const comps = Array.isArray(value) ? value : []
  const lastName = (comps[0] ?? '').toString().trim()
  const firstName = (comps[1] ?? '').toString().trim()
  if (firstName || lastName) return { firstName, lastName }
  return splitDisplayName(vcard.getFirstPropertyValue('fn')?.toString() ?? '')
}

/** Overwrite the vCard's display name (`FN`) and structured name (`N`). */
export function setVCardName(vcard: ICAL.Component, firstName: string, lastName: string): void {
  vcard.updatePropertyWithValue('fn', `${firstName} ${lastName}`.trim())
  const existing = vcard.getFirstProperty('n')
  if (existing) {
    existing.setValue([lastName, firstName, '', '', ''])
  } else {
    const n = new ICAL.Property('n', vcard)
    n.setValue([lastName, firstName, '', '', ''])
    vcard.addProperty(n)
  }
}
