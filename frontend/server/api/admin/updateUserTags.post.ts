import { z } from 'zod'
import { createUser, findUserByEmail, saveUser, X_ADMIN_TAGS } from '~~/server/helpers/dav'
import ICAL from 'ical.js'
import { defaultParams, emailRenderer } from '~~/server/helpers/email'
import path from 'path'

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

  let newTags: string[] = []
  if (!userQuery) {
    const newUser = new ICAL.Component('vcard')
    newUser.addPropertyWithValue('email', email)
    newUser.addPropertyWithValue('categories', '')
    newUser
      .getFirstProperty('categories')
      ?.setValues(filteredTags.filter((t) => t.state).map((t) => t.name))

    await createUser(config, newUser)
    newTags = filteredTags.filter((t) => t.state).map((t) => t.name)
  } else {
    const { user, vcard: userVcard } = userQuery
    let userTags = userVcard.getFirstProperty('categories')?.getValues() as string[]
    filteredTags.map((t) => {
      if (t.state) {
        if (!userTags.includes(t.name)) {
          userTags.push(t.name)
          newTags.push(t.name)
        }
      } else {
        userTags = userTags.filter((item) => item !== t.name)
      }
    })
    userVcard.getFirstProperty('categories')?.setValues(userTags)
    await saveUser(config, user, userVcard)
  }

  // sendMail if selected and at least one new tag is set
  if (sendMail && newTags.length > 0) {
    const to = { address: email.toString(), name: '' }
    const adminName = session.user.name
      ? session.user.name.split(' ').slice(-1).pop()
      : session.user.email
    try {
      await emailRenderer.send({
        template: path.join(process.cwd(), 'server/emails/welcome'),
        message: {
          to,
        },
        locals: {
          ...defaultParams,
          locale: 'de',
          newUser: !userQuery,
          tags: newTags,
          adminName,
        },
      })
    } catch (error) {
      throw new Error(error as string)
    }
    return true
  }
  return false
})
