import { z } from 'zod'

import { tagStateFor } from '~~/server/helpers/userTags'

const bodySchema = z.object({
  email: z.email(),
})

const config = useRuntimeConfig()

export default defineEventHandler(async (event) => {
  // make sure the user is logged in
  // This will throw a 401 error if the request doesn't come from a valid user session
  const session = await requireUserSession(event)

  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not Authorized' })
  }

  const { email } = await readValidatedBody(event, bodySchema.parse)

  // The DAV work itself lives in the helper, which the uid-keyed route in the
  // members' area uses too — one implementation, two ways in.
  return tagStateFor(config, session.user.email, email)
})
