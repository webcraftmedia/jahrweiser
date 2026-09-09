import { unlink } from 'node:fs/promises'
import path from 'node:path'

import { z } from 'zod'

import { parseBlaettchenFile } from '~~/shared/blaettchen'

/**
 * Removes one issue from the archive.
 *
 * Admin-only, and irreversible — the PDF is gone, there is no other copy on the
 * server. The name goes through the same grammar as everywhere else, so a
 * request can only ever address a file inside the issue directory.
 */
const bodySchema = z.object({
  file: z.string(),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not Authorized' })
  }

  const { file } = await readValidatedBody(event, bodySchema.parse)
  const issue = parseBlaettchenFile(file)
  if (!issue) {
    throw createError({ statusCode: 404, statusMessage: 'Blaettchen issue not found' })
  }

  const config = useRuntimeConfig()
  const dir = path.resolve(process.cwd(), config.BLAETTCHEN_DIR)
  const target = path.resolve(dir, issue.file)
  // Redundant given the grammar, and deliberately so — see the download
  // endpoint for the same guard and the same reasoning.
  if (path.dirname(target) !== dir) {
    throw createError({ statusCode: 404, statusMessage: 'Blaettchen issue not found' })
  }

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Dateiname ist durch parseBlaettchenFile validiert (trennzeichenfrei) und liegt nachweislich im konfigurierten Verzeichnis
    await unlink(target)
  } catch (error) {
    // Deleting something that is already gone is the state the caller wanted,
    // but they asked about a specific file — say it is not there.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw createError({ statusCode: 404, statusMessage: 'Blaettchen issue not found' })
    }
    console.error(`Failed to delete Blättchen issue ${target}:`, error)
    throw createError({ statusCode: 500, statusMessage: 'Blaettchen issue not deletable' })
  }

  // The archive keeps no history of its own; the log is it.
  console.warn(`Blättchen issue ${issue.file} deleted by ${session.user.email}`)
  return {}
})
