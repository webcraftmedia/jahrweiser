import ICAL from 'ical.js'

import {
  calendarKey,
  calendarLabel,
  createCalDAVAccount,
  createCardDAVAccount,
  createUser,
  findCalendars,
  findUserByEmail,
  readAdminTags,
  readCategories,
  saveUser,
} from './dav'

/**
 * Which calendars a member may see, read and written through DAV.
 *
 * Extracted from `api/admin/updateUserTags.post.ts` so that the members' area
 * can offer the same thing keyed by uid: the detail page holds a uid and a
 * masked address, and sending the real address through the browser to reach
 * this feature would undo the masking for the sake of a checkbox list.
 *
 * DAV stays the source of truth throughout — the tags live in the vCard's
 * CATEGORIES, and the sidecar mirror is refreshed by the sync.
 */

export interface TagState {
  /** The calendar key, which is what gets stored. */
  name: string
  /** Human name of that calendar; falls back to the key. */
  label: string
  state: boolean
}

interface DavConfig {
  DAV_USERNAME: string
  DAV_PASSWORD: string
  DAV_URL: string
  DAV_URL_CARD: string
}

/**
 * What this admin is allowed to hand out: their own X-ADMIN-TAGS, which is what
 * keeps one admin from granting access to a calendar that is not theirs.
 *
 * Deliberately does *not* fetch the calendar list — that is only needed to put
 * names next to the keys, and making every write wait on a second DAV round
 * trip (which can fail on its own) would be a cost for nothing.
 */
async function grantable(config: DavConfig, adminEmail: string) {
  const cardDav = createCardDAVAccount(config)
  const admin = await findUserByEmail(cardDav, adminEmail)
  if (!admin) {
    throw createError({ statusCode: 403, statusMessage: 'Admin account not found' })
  }

  return { cardDav, adminTags: readAdminTags(admin.vcard) }
}

/** What the admin may grant, and which of it this member already has. */
export async function tagStateFor(
  config: DavConfig,
  adminEmail: string,
  targetEmail: string,
): Promise<TagState[]> {
  const { cardDav, adminTags } = await grantable(config, adminEmail)

  // A key without a matching calendar falls back to itself, so a dangling grant
  // stays visible instead of rendering as a blank checkbox.
  const calendars = await findCalendars(createCalDAVAccount(config))
  const labels = new Map(calendars.map((cal) => [calendarKey(cal), calendarLabel(cal)]))
  const labelFor = (key: string) => labels.get(key) || key

  const target = await findUserByEmail(cardDav, targetEmail)
  const held = target ? readCategories(target.vcard) : []

  return adminTags.map((name) => ({ name, label: labelFor(name), state: held.includes(name) }))
}

/**
 * Apply a set of checkboxes, and report what was newly granted.
 *
 * "Newly granted" rather than "granted" because that is what decides whether a
 * welcome mail goes out: telling somebody about a calendar they have had for a
 * year is noise.
 */
export async function applyTagChanges(
  config: DavConfig,
  adminEmail: string,
  targetEmail: string,
  tags: { name: string; state: boolean }[],
): Promise<{ newTags: string[]; created: boolean }> {
  const { cardDav, adminTags } = await grantable(config, adminEmail)
  // Silently dropping the rest rather than refusing: a stale page may still
  // carry a calendar this admin has since lost, and that is not an error the
  // member should feel.
  const allowed = tags.filter((tag) => adminTags.includes(tag.name))

  const target = await findUserByEmail(cardDav, targetEmail)

  if (!target) {
    const vcard = new ICAL.Component('vcard')
    // VERSION is mandatory (RFC 6350 §6.7.9) and must come first. Without it
    // ical.js falls back to the vCard 3 design when re-reading the card, which
    // changes how comma-separated properties are parsed.
    vcard.addPropertyWithValue('version', '4.0')
    vcard.addPropertyWithValue('email', targetEmail)
    vcard.addPropertyWithValue('categories', '')
    const granted = allowed.filter((tag) => tag.state).map((tag) => tag.name)
    vcard.getFirstProperty('categories')?.setValues(granted)

    await createUser(cardDav, vcard)
    return { newTags: granted, created: true }
  }

  const { user, vcard } = target
  let categories = vcard.getFirstProperty('categories')
  if (!categories) {
    vcard.addPropertyWithValue('categories', '')
    categories = vcard.getFirstProperty('categories')!
  }

  // ICAL.Property#getValues() always returns an array — no nullish fallback
  // needed, and adding one creates an unreachable branch.
  let held = categories.getValues() as string[]
  const newTags: string[] = []
  for (const tag of allowed) {
    if (tag.state) {
      if (!held.includes(tag.name)) {
        held.push(tag.name)
        newTags.push(tag.name)
      }
    } else {
      held = held.filter((name) => name !== tag.name)
    }
  }
  vcard.getFirstProperty('categories')?.setValues(held)
  await saveUser(cardDav, user, vcard)

  return { newTags, created: false }
}
