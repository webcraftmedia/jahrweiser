import { z } from 'zod'

import { createCardDAVAccount, findUserByEmail, X_ADMIN_TAGS } from '~~/server/helpers/dav'

const bodySchema = z.object({
  email: z.email(),
})

const config = useRuntimeConfig()

export default defineEventHandler(async (event) => {
  // make sure the user is logged in
  // This will throw a 401 error if the request doesn't come from a valid user session
  const session = await requireUserSession(event)

  if (session.user.role !== 'admin') {
    throw new Error('Not Authorized')
  }

  // Find admin
  const cardDavAccount = createCardDAVAccount(config)
  const adminQuery = await findUserByEmail(cardDavAccount, session.user.email)

  if (!adminQuery) {
    throw new Error('Huston, we have a problem')
  }

  const { vcard: adminVcard } = adminQuery
  const adminTags = adminVcard.getFirstPropertyValue(X_ADMIN_TAGS)?.toString().split(',') ?? []

  // Find user
  const { email } = await readValidatedBody(event, bodySchema.parse)
  const userQuery = await findUserByEmail(cardDavAccount, email)

  if (!userQuery) {
    return adminTags.map((t) => {
      return { name: t, state: false }
    })
  }

  const { vcard: userVcard } = userQuery
  const userTags = userVcard.getFirstProperty('categories')?.getValues()

  return adminTags.map((t) => {
    return { name: t, state: userTags?.includes(t) }
  })
})
