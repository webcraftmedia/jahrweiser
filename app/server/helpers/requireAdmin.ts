/**
 * The gate every `/api/admin/**` endpoint stands behind.
 *
 * Written out once rather than eight times: the check is two lines, but two
 * lines repeated per endpoint is two lines that can be forgotten on the ninth —
 * and the thing being guarded here is a members' directory.
 *
 * 403 rather than 404 for a signed-in non-admin: they are a legitimate member
 * asking for something that is not theirs, and pretending the route does not
 * exist would only send them looking. `requireUserSession` has already turned
 * "not signed in at all" into a 401 before this runs.
 */

type RequestEvent = Parameters<typeof requireUserSession>[0]

export interface AdminActor {
  uid: string
  email: string
  name: string | null
  role: string
}

export async function requireAdmin(event: RequestEvent): Promise<AdminActor> {
  const session = await requireUserSession(event)
  const user = session.user as Partial<AdminActor> | undefined

  if (user?.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not Authorized' })
  }
  // Every admin action is recorded against whoever took it, so an actor
  // without an id is a session shaped in a way we cannot hold to account.
  if (!user.uid) {
    throw createError({ statusCode: 401, statusMessage: 'No user context' })
  }

  return { uid: user.uid, email: user.email ?? '', name: user.name ?? null, role: user.role }
}
