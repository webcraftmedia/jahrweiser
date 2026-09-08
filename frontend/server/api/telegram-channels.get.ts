import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { z } from 'zod'

/**
 * The Telegram invitations shown on /telegram.
 *
 * Behind `requireUserSession` on purpose: a private invite link *is* the
 * permission — whoever holds it can join. Serving the list through
 * `runtimeConfig.public` would put it in the client bundle, readable by any
 * anonymous visitor in the page source.
 *
 * Read from a file that is git-ignored (see .gitignore), so invitations never
 * end up in the repository. Deliberately not cached: editing the file on the
 * server takes effect immediately, no deploy and no restart. The list is tiny
 * and only read when someone opens the page.
 */
const channelSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  // Every Telegram invitation is a plain https://t.me/… link, whether it points
  // at a public channel (`/name`), a private invite (`/+hash`) or the legacy
  // form (`/joinchat/hash`) — no type distinction is needed to open them.
  url: z.url().refine((value) => value.startsWith('https://t.me/'), {
    message: 'must be a https://t.me/ link',
  }),
  /** Only a label for the reader; it has no effect on how the link is used. */
  public: z.boolean().optional(),
})

const fileSchema = z.array(channelSchema)

export type TelegramChannel = z.infer<typeof channelSchema>

export default defineEventHandler(async (event): Promise<TelegramChannel[]> => {
  await requireUserSession(event)

  const config = useRuntimeConfig()
  const file = path.resolve(process.cwd(), config.TELEGRAM_CHANNELS_FILE)

  let raw: string
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad stammt aus der runtimeConfig (Betreiber-Konfiguration), nicht aus einer Anfrage
    raw = await readFile(file, 'utf-8')
  } catch (error) {
    // Not configured yet is a legitimate state — the page shows its empty
    // message. Anything other than "file missing" is a real problem worth
    // surfacing rather than swallowing.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    console.error(`Failed to read Telegram channels from ${file}:`, error)
    throw createError({ statusCode: 500, statusMessage: 'Telegram channels unreadable' })
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (error) {
    // JSON.parse wirft nur SyntaxError. Die Datei wird von Hand gepflegt — ein
    // Komma zu viel darf keinen nackten 500 ohne Logzeile ergeben.
    console.error(`Telegram channel file ${file} is not valid JSON:`, error)
    throw createError({ statusCode: 500, statusMessage: 'Telegram channels malformed' })
  }

  const parsed = fileSchema.safeParse(json)
  if (!parsed.success) {
    // A malformed file is an operator error. Failing loudly beats rendering an
    // empty list that looks like "no channels configured".
    console.error(`Invalid Telegram channel file ${file}:`, z.prettifyError(parsed.error))
    throw createError({ statusCode: 500, statusMessage: 'Telegram channels malformed' })
  }
  return parsed.data
})
