import { expect, test } from '@playwright/test'

import { createDavUser, deleteDavUser, triggerSync } from './helpers/dav'
import { closeDb, readUserTags } from './helpers/db'

/*
 * The mirror of X-ADMIN-TAGS into `user_tags`, against a real MariaDB —
 * deliberately not against a mocked one. The bug this guards lives entirely in
 * the gap between two notions of equality: `user_tags` is keyed on
 * (user_uid, tag) in a `utf8mb4_unicode_ci` database, where `Flohmarkt` and
 * `flohmarkt` are one key, while the JavaScript sets that compute the diff hold
 * them to be two. A stubbed database cannot express that, so a unit test here
 * would pass no matter which order the writes go in.
 *
 * What it cost in production: renaming a tag by its spelling alone made every
 * sync die on ER_DUP_ENTRY, which took member updates, soft-deletes and the
 * daily metrics down with it for five days.
 */

const UID = 'e2e-sync-tags'
const EMAIL = 'sync-tags@example.com'

test.afterAll(async () => {
  await deleteDavUser(UID)
  await triggerSync()
  await closeDb()
})

test('a tag that changes only in spelling does not break the sync', async () => {
  await createDavUser({ uid: UID, email: EMAIL, displayName: 'Tag Test', tags: ['Flohmarkt'] })
  await triggerSync()
  expect(await readUserTags(UID)).toStrictEqual(['Flohmarkt'])

  // The rename. Previously: INSERT 'flohmarkt' ran before DELETE 'Flohmarkt',
  // collided with the row it was about to replace, and threw a 500 that no
  // later run could get past.
  await createDavUser({ uid: UID, email: EMAIL, displayName: 'Tag Test', tags: ['flohmarkt'] })
  await triggerSync()

  // DAV owns the spelling, so the mirror follows it rather than keeping the
  // one it happened to see first.
  expect(await readUserTags(UID)).toStrictEqual(['flohmarkt'])
})

test('a tag listed twice in one vCard is mirrored once', async () => {
  // Same collation gap, one statement earlier: 'Chor' and 'chor' are a single
  // key, so an un-deduplicated insert collides with itself.
  await createDavUser({
    uid: UID,
    email: EMAIL,
    displayName: 'Tag Test',
    tags: ['chor', 'Chor', 'vorstand'],
  })
  await triggerSync()

  expect(await readUserTags(UID)).toStrictEqual(['chor', 'vorstand'])
})
