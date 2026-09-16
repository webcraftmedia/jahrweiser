import { eq } from 'drizzle-orm'

import { useDb } from '../../db'
import { users } from '../../db/schema'

/**
 * Public, no-auth endpoint targeted by the `List-Unsubscribe` mail header.
 * Per RFC 8058 we accept both GET (legacy clients) and POST (one-click
 * standard). Idempotent — calling repeatedly with the same token is fine.
 *
 * Returns HTML on GET (user clicked from mail client), and an empty 200 on
 * POST (machine clients don't render).
 */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  if (typeof token !== 'string' || token.length === 0) return false
  const db = useDb()
  const row = (
    await db
      .select({ uid: users.uid })
      .from(users)
      .where(eq(users.unsubscribeToken, token))
      .limit(1)
  )[0]
  if (!row) return false
  await db.update(users).set({ newsletterSubscribed: 'unsubscribed' }).where(eq(users.uid, row.uid))
  return true
}
