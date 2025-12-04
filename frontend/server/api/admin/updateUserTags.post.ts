import { z } from 'zod'
import { findUserByEmail, saveUser, X_ADMIN_TAGS } from '~~/server/helpers/dav'

const bodySchema = z.object({
  email: z.email(),
  tags: z.array(z.object({ name: z.string(), state: z.boolean() })),
  sendMail: z.boolean(),
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
  const adminQuery = await findUserByEmail(config, session.user.email)

  if (!adminQuery) {
    throw new Error('Huston, we have a problem')
  }

  const { vcard: adminVcard } = adminQuery
  const adminTags = adminVcard.getFirstPropertyValue(X_ADMIN_TAGS)?.toString().split(',') ?? []

  const { email, tags, sendMail } = await readValidatedBody(event, bodySchema.parse)
  const filteredTags = tags.filter((t) => adminTags.includes(t.name))

  const userQuery = await findUserByEmail(config, email)

  if (!userQuery) {
    // create user, add tags
    // TODO
    return true
  }

  const { user, vcard: userVcard } = userQuery
  let userTags = userVcard.getFirstProperty('categories')?.getValues() as string[]
  filteredTags.map((t) => {
    if (t.state) {
      if (!userTags.includes(t.name)) {
        userTags.push(t.name)
      }
    } else {
      userTags = userTags.filter((item) => item !== t.name)
    }
  })

  console.log(userTags)

  userVcard.getFirstProperty('categories')?.setValues(userTags)

  if (sendMail) {
    console.log('TODO: send mail')
  }

  await saveUser(config, user, userVcard)
  return true
})
