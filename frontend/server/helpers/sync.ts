import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import ICAL from 'ical.js'
import { fetchAddressBooks, fetchVCards } from 'tsdav'

import { useDb } from '../db'
import { loginTokens, sessions, syncState, userTags, users } from '../db/schema'

import { createCardDAVAccount, headers, X_ADMIN_TAGS, X_ROLE } from './dav'

import type { DAV_CONFIG } from './dav'
import type * as schema from '../db/schema'
import type { MySql2Database } from 'drizzle-orm/mysql2'

const LOCK_STALE_MINUTES = 10

export interface SyncResult {
  added: number
  updated: number
  deleted: number
  emailChanges: number
  durationMs: number
  skippedLocked: boolean
}

interface DavUserSnapshot {
  uid: string
  email: string
  displayName: string | null
  role: 'admin' | 'user'
  tags: string[]
}

export function extractUserFromVCardData(vcardData: string): DavUserSnapshot | null {
  let component: ICAL.Component
  try {
    component = new ICAL.Component(ICAL.parse(vcardData))
  } catch {
    return null
  }
  const uid = component.getFirstPropertyValue('uid')?.toString()
  if (!uid) return null
  const email = component.getFirstPropertyValue('email')?.toString().toLowerCase()
  if (!email) return null
  const displayName = component.getFirstPropertyValue('fn')?.toString() ?? null
  const roleValue = component.getFirstPropertyValue(X_ROLE)?.toString()
  const role: 'admin' | 'user' = roleValue === 'admin' ? 'admin' : 'user'
  const tagsValue = component.getFirstPropertyValue(X_ADMIN_TAGS)?.toString() ?? ''
  const tags = tagsValue
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  return { uid, email, displayName, role, tags }
}

async function acquireLock(
  db: MySql2Database<typeof schema>,
  collectionUrl: string,
): Promise<boolean> {
  const now = new Date()
  const staleThreshold = new Date(now.getTime() - LOCK_STALE_MINUTES * 60_000)

  await db
    .insert(syncState)
    .values({ collectionUrl, runningSince: now })
    .onDuplicateKeyUpdate({
      set: {
        runningSince: sql`CASE
          WHEN ${syncState.runningSince} IS NULL OR ${syncState.runningSince} < ${staleThreshold}
          THEN ${now}
          ELSE ${syncState.runningSince}
        END`,
      },
    })

  const rows = await db
    .select({ runningSince: syncState.runningSince })
    .from(syncState)
    .where(eq(syncState.collectionUrl, collectionUrl))
    .limit(1)

  return rows[0]?.runningSince?.getTime() === now.getTime()
}

async function releaseLock(
  db: MySql2Database<typeof schema>,
  collectionUrl: string,
  lastSyncedAt: Date,
): Promise<void> {
  await db
    .update(syncState)
    .set({ runningSince: null, lastSyncedAt })
    .where(eq(syncState.collectionUrl, collectionUrl))
}

async function applyUserDiff(
  db: MySql2Database<typeof schema>,
  davSnapshots: DavUserSnapshot[],
): Promise<{ added: number; updated: number; deleted: number; emailChanges: number }> {
  const davByUid = new Map(davSnapshots.map((u) => [u.uid, u]))
  const existing = await db.select().from(users)
  const existingByUid = new Map(existing.map((u) => [u.uid, u]))

  let added = 0
  let updated = 0
  let deleted = 0
  let emailChanges = 0

  for (const dav of davSnapshots) {
    const current = existingByUid.get(dav.uid)
    if (!current) {
      await db.insert(users).values({
        uid: dav.uid,
        email: dav.email,
        displayName: dav.displayName,
        role: dav.role,
      })
      if (dav.tags.length > 0) {
        await db.insert(userTags).values(dav.tags.map((tag) => ({ userUid: dav.uid, tag })))
      }
      added += 1
      continue
    }

    // role is MariaDB-authoritative — sync does NOT touch role on UPDATE,
    // only on INSERT (where it seeds from X_ROLE for initial backfill).
    const emailChanged = current.email !== dav.email
    const nameChanged = current.displayName !== dav.displayName
    const wasDeleted = current.deletedAt !== null

    if (emailChanged || nameChanged || wasDeleted) {
      await db
        .update(users)
        .set({ email: dav.email, displayName: dav.displayName, deletedAt: null })
        .where(eq(users.uid, dav.uid))
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

    const currentTagRows = await db
      .select({ tag: userTags.tag })
      .from(userTags)
      .where(eq(userTags.userUid, dav.uid))
    const currentTagSet = new Set(currentTagRows.map((r) => r.tag))
    const davTagSet = new Set(dav.tags)
    const toAdd = dav.tags.filter((t) => !currentTagSet.has(t))
    const toRemove = [...currentTagSet].filter((t) => !davTagSet.has(t))
    if (toAdd.length > 0) {
      await db.insert(userTags).values(toAdd.map((tag) => ({ userUid: dav.uid, tag })))
    }
    if (toRemove.length > 0) {
      await db
        .delete(userTags)
        .where(and(eq(userTags.userUid, dav.uid), inArray(userTags.tag, toRemove)))
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

  return { added, updated, deleted, emailChanges }
}

export async function syncDavToSidecar(davConfig: DAV_CONFIG): Promise<SyncResult> {
  const start = Date.now()
  const db = useDb()
  const account = createCardDAVAccount(davConfig)
  const fetchHeaders = headers(account)

  const addressbooks = await fetchAddressBooks({ account, headers: fetchHeaders })
  const addressbook = addressbooks[0]
  if (!addressbook) {
    throw new Error('No addressbook found on the DAV server.')
  }
  const collectionUrl = addressbook.url

  const acquired = await acquireLock(db, collectionUrl)
  if (!acquired) {
    return { added: 0, updated: 0, deleted: 0, emailChanges: 0, durationMs: 0, skippedLocked: true }
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
    await releaseLock(db, collectionUrl, new Date())
    throw err
  }
}
