import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import ICAL from 'ical.js'
import { fetchAddressBooks, fetchVCards } from 'tsdav'

import { useDb } from '../db'
import { loginTokens, sessions, syncState, userTags, users } from '../db/schema'

import { displayNameFromVCard, readPostalCode } from './contactName'
import { createCardDAVAccount, headers, readAdminTags, X_ROLE } from './dav'
import { clearEmailNotFound } from './negativeCache'

import type { DAV_CONFIG } from './dav'
import type * as schema from '../db/schema'
import type { MySql2Database } from 'drizzle-orm/mysql2'

const LOCK_STALE_MINUTES = 10

export interface SyncResult {
  added: number
  updated: number
  deleted: number
  emailChanges: number
  /**
   * Contacts whose admin tags could not be mirrored. The sync carries on past
   * one — the tags are a convenience, the member data is not — so this is the
   * only place it shows up. Anything above zero belongs in the cron log.
   */
  tagFailures: number
  durationMs: number
  skippedLocked: boolean
}

interface DavUserSnapshot {
  uid: string
  email: string
  displayName: string | null
  /** vCard ADR postal code, null when the contact has none. */
  postalCode: string | null
  role: 'admin' | 'user'
  tags: string[]
}

export function extractUserFromVCardData(vcardData: string): DavUserSnapshot | null {
  let component: ICAL.Component
  try {
    component = new ICAL.Component(ICAL.parse(vcardData))
    // eslint-disable-next-line no-catch-all/no-catch-all -- null ist der dokumentierte Rueckgabewert fuer unlesbare VCards
  } catch (error) {
    // null = "kein verwertbarer Nutzer" (Contract dieser Funktion). Geloggt, weil
    // ein unlesbares VCard sonst stillschweigend aus dem Sync fällt.
    console.warn('[sync] skipping unparseable vCard:', error)
    return null
  }
  const uid = component.getFirstPropertyValue('uid')?.toString()
  if (!uid) return null
  const email = component.getFirstPropertyValue('email')?.toString().toLowerCase()
  if (!email) return null
  // Prefer the structured N ("Given Family") over FN — some DAV clients
  // (InfCloud) store FN in "Family Given" order, which would otherwise surface
  // reversed everywhere (greeting, invitation, emails).
  const displayName = displayNameFromVCard(component)
  const roleValue = component.getFirstPropertyValue(X_ROLE)?.toString()
  const role: 'admin' | 'user' = roleValue === 'admin' ? 'admin' : 'user'
  const tags = readAdminTags(component)
  // Unlike role, the postal code is contact data — DAV owns it, so an empty
  // ADR here means "cleared in a DAV client" and must overwrite the sidecar.
  const postalCode = readPostalCode(component) || null
  return { uid, email, displayName, postalCode, role, tags }
}

async function acquireLock(
  db: MySql2Database<typeof schema>,
  collectionUrl: string,
): Promise<boolean> {
  const now = new Date()
  const staleThreshold = new Date(now.getTime() - LOCK_STALE_MINUTES * 60_000)

  // Ensure the row exists. No-op update on conflict.
  await db
    .insert(syncState)
    .values({ collectionUrl })
    .onDuplicateKeyUpdate({ set: { collectionUrl: sql`${syncState.collectionUrl}` } })

  // Conditional acquire: only set running_since if currently null or stale.
  // Drizzle returns the mysql2 ResultSetHeader which has affectedRows. Use
  // changedRows to know whether the row actually transitioned.
  const result = (await db
    .update(syncState)
    .set({ runningSince: now })
    .where(
      and(
        eq(syncState.collectionUrl, collectionUrl),
        or(isNull(syncState.runningSince), lt(syncState.runningSince, staleThreshold)),
      ),
    )) as unknown as [{ affectedRows: number }]

  return result[0].affectedRows > 0
}

/**
 * Frees the lock. `lastSyncedAt` is null for a run that failed — the column
 * records the last *successful* sync, and is the only thing that can tell an
 * operator that DAV has not been reconciled in days.
 */
async function releaseLock(
  db: MySql2Database<typeof schema>,
  collectionUrl: string,
  lastSyncedAt: Date | null,
): Promise<void> {
  await db
    .update(syncState)
    .set(lastSyncedAt === null ? { runningSince: null } : { runningSince: null, lastSyncedAt })
    .where(eq(syncState.collectionUrl, collectionUrl))
}

/** Adds tag rows, treating one that is already there as nothing to do. */
async function insertTags(
  db: MySql2Database<typeof schema>,
  userUid: string,
  tags: string[],
): Promise<void> {
  await db
    .insert(userTags)
    .values(tags.map((tag) => ({ userUid, tag })))
    // A no-op update: MySQL has no "on conflict do nothing" for this, and
    // `INSERT IGNORE` would swallow unrelated errors too.
    .onDuplicateKeyUpdate({ set: { userUid: sql`${userTags.userUid}` } })
}

/**
 * Brings `user_tags` in line with the tags on a DAV contact.
 *
 * Removals go first, and that order is the whole point. `user_tags` is keyed on
 * (user_uid, tag) in a database created `utf8mb4_unicode_ci`
 * (infra/db/setup.sql), which MariaDB 11 resolves to `utf8mb4_uca1400_ai_ci`:
 * `Flohmarkt`, `flohmarkt` and `flohmarkt ` are one key there — while the sets
 * below, being JavaScript, hold them to be three. Renaming a tag by
 * its spelling alone therefore yields an add and a remove that are the same row
 * to the database: inserting first collides with the very row the delete was
 * about to take away, and no later run can recover because the collision
 * happens again every time.
 *
 * Deleting first makes the rename land in the order it actually is — the old
 * row goes, the new spelling arrives — and keeps DAV's spelling authoritative
 * rather than freezing whatever the mirror happened to see first.
 *
 * The insert stays idempotent on top of that: the same collation gap can be
 * opened by rows this function never wrote, and a duplicate must cost nothing.
 */
async function mirrorTags(
  db: MySql2Database<typeof schema>,
  dav: Pick<DavUserSnapshot, 'uid' | 'tags'>,
): Promise<void> {
  const currentTagRows = await db
    .select({ tag: userTags.tag })
    .from(userTags)
    .where(eq(userTags.userUid, dav.uid))
  const currentTagSet = new Set(currentTagRows.map((r) => r.tag))
  const davTagSet = new Set(dav.tags)
  const toRemove = [...currentTagSet].filter((t) => !davTagSet.has(t))
  const toAdd = dav.tags.filter((t) => !currentTagSet.has(t))

  if (toRemove.length > 0) {
    await db
      .delete(userTags)
      .where(and(eq(userTags.userUid, dav.uid), inArray(userTags.tag, toRemove)))
  }
  if (toAdd.length > 0) {
    await insertTags(db, dav.uid, toAdd)
  }
}

async function applyUserDiff(
  db: MySql2Database<typeof schema>,
  davSnapshots: DavUserSnapshot[],
): Promise<{
  added: number
  updated: number
  deleted: number
  emailChanges: number
  tagFailures: number
}> {
  const davByUid = new Map(davSnapshots.map((u) => [u.uid, u]))
  const existing = await db.select().from(users)
  const existingByUid = new Map(existing.map((u) => [u.uid, u]))

  let added = 0
  let updated = 0
  let deleted = 0
  let emailChanges = 0
  let tagFailures = 0

  for (const dav of davSnapshots) {
    const current = existingByUid.get(dav.uid)
    if (!current) {
      await db.insert(users).values({
        uid: dav.uid,
        email: dav.email,
        displayName: dav.displayName,
        postalCode: dav.postalCode,
        role: dav.role,
      })
      // A login attempt before this user existed may have negative-cached the
      // address; clear it so they can log in immediately.
      clearEmailNotFound(dav.email)
      added += 1
    } else {
      // role is MariaDB-authoritative — sync does NOT touch role on UPDATE,
      // only on INSERT (where it seeds from X_ROLE for initial backfill).
      const emailChanged = current.email !== dav.email
      const nameChanged = current.displayName !== dav.displayName
      const postalCodeChanged = current.postalCode !== dav.postalCode
      const wasDeleted = current.deletedAt !== null

      if (emailChanged || nameChanged || postalCodeChanged || wasDeleted) {
        await db
          .update(users)
          .set({
            email: dav.email,
            displayName: dav.displayName,
            postalCode: dav.postalCode,
            deletedAt: null,
          })
          .where(eq(users.uid, dav.uid))
        // New address (on email change) or a reactivated user may sit in the
        // negative cache; clear it so login works without waiting out the TTL.
        clearEmailNotFound(dav.email)
        updated += 1
        if (emailChanged) {
          emailChanges += 1
          await db
            .update(sessions)
            .set({ revokedAt: new Date() })
            .where(and(eq(sessions.userUid, dav.uid), isNull(sessions.revokedAt)))
          await db.delete(loginTokens).where(eq(loginTokens.userUid, dav.uid))
        }
      }
    }

    // One path for a new and an existing contact: for a new one the mirror
    // starts empty, so the diff below degenerates to "insert everything" — the
    // special case it used to have bought one saved SELECT and a second place
    // for this bug to live.
    //
    // Mirroring admin tags is cosmetic next to everything above, so it is
    // sealed off: before this, one bad tag row aborted the whole sync — member
    // updates, soft-deletes and the daily metrics with it.
    try {
      await mirrorTags(db, dav)
      // eslint-disable-next-line no-catch-all/no-catch-all -- Tag-Spiegelung ist Beiwerk; ein Fehler hier darf den Sync nicht abbrechen
    } catch (error) {
      console.error(`[sync] failed to mirror tags for ${dav.uid}:`, error)
      tagFailures += 1
    }
  }

  for (const current of existing) {
    if (davByUid.has(current.uid)) continue
    if (current.deletedAt !== null) continue
    await db
      .update(users)
      .set({ deletedAt: new Date(), loginDisabled: true })
      .where(eq(users.uid, current.uid))
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userUid, current.uid), isNull(sessions.revokedAt)))
    await db.delete(loginTokens).where(eq(loginTokens.userUid, current.uid))
    deleted += 1
  }

  return { added, updated, deleted, emailChanges, tagFailures }
}

export async function syncDavToSidecar(davConfig: DAV_CONFIG): Promise<SyncResult> {
  const start = Date.now()
  const db = useDb()
  const account = createCardDAVAccount(davConfig)
  const fetchHeaders = headers(account)

  const discovered = await fetchAddressBooks({ account, headers: fetchHeaders })
  // Some DAV servers (notably fresh Baikal installs) don't expose principal
  // discovery cleanly. Fall back to the configured homeUrl, which by
  // convention points at the default addressbook.
  const addressbook = discovered[0] ?? { url: account.homeUrl ?? '' }
  if (!addressbook.url) {
    throw new Error('No addressbook found on the DAV server and no homeUrl configured.')
  }
  const collectionUrl = addressbook.url

  const acquired = await acquireLock(db, collectionUrl)
  if (!acquired) {
    return {
      added: 0,
      updated: 0,
      deleted: 0,
      emailChanges: 0,
      tagFailures: 0,
      durationMs: 0,
      skippedLocked: true,
    }
  }

  try {
    const vcards = await fetchVCards({ addressBook: addressbook, headers: fetchHeaders })
    const snapshots: DavUserSnapshot[] = []
    for (const vc of vcards) {
      const snap = extractUserFromVCardData(vc.data)
      if (snap) snapshots.push(snap)
    }

    const diff = await applyUserDiff(db, snapshots)
    await releaseLock(db, collectionUrl, new Date())

    return { ...diff, durationMs: Date.now() - start, skippedLocked: false }
  } catch (err) {
    // The lock goes, the success timestamp does not: a run that threw has not
    // synced anything, and stamping `last_synced_at` anyway is how a sync that
    // had been failing for five days still looked healthy in the table.
    await releaseLock(db, collectionUrl, null)
    throw err
  }
}
