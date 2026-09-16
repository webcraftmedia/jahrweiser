import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { parseBlaettchenFile } from '../../../shared/blaettchen'

/**
 * Serves a single Blättchen PDF.
 *
 * Behind `requireUserSession` like the listing — a direct link to the file must
 * not be a way around it. The requested name is not used as a path until it has
 * been through `parseBlaettchenFile`, whose grammar is anchored and contains no
 * path separator: anything that is not a well-formed issue name is a 404 before
 * the file system is touched at all.
 *
 * Issues are a few hundred kilobytes each, so the file is read into memory
 * rather than streamed — no partial-response handling, no open descriptor to
 * leak, and a PDF viewer gets its Content-Length up front.
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const requested = getRouterParam(event, 'file', { decode: true })
  const issue = requested ? parseBlaettchenFile(requested) : null
  if (!issue) throw createError({ statusCode: 404, statusMessage: 'Blaettchen issue not found' })

  const config = useRuntimeConfig()
  const dir = path.resolve(process.cwd(), config.BLAETTCHEN_DIR)
  const file = path.resolve(dir, issue.file)
  // Redundant given the grammar above, and deliberately so: should the pattern
  // ever be loosened, this fails closed instead of serving arbitrary files.
  if (path.dirname(file) !== dir) {
    throw createError({ statusCode: 404, statusMessage: 'Blaettchen issue not found' })
  }

  let pdf: Buffer
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Dateiname ist durch parseBlaettchenFile validiert (trennzeichenfrei) und liegt nachweislich im konfigurierten Verzeichnis
    pdf = await readFile(file)
  } catch (error) {
    // A link to an issue that has since been removed is an ordinary 404, not a
    // server fault. Everything else (permissions, a directory in its place) is.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw createError({ statusCode: 404, statusMessage: 'Blaettchen issue not found' })
    }
    console.error(`Failed to read Blättchen issue ${file}:`, error)
    throw createError({ statusCode: 500, statusMessage: 'Blaettchen issue unreadable' })
  }

  setHeader(event, 'Content-Type', 'application/pdf')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  // Member-only content: a shared cache must never keep a copy, and a logged
  // out user must not get one from the browser's back/forward cache either.
  setHeader(event, 'Cache-Control', 'private, no-store')
  // Plain ASCII name: it is what ends up in the download folder, and it stays
  // free of the quoting and RFC 5987 encoding an umlaut would drag in.
  setHeader(
    event,
    'Content-Disposition',
    `inline; filename="Blaettchen-${String(issue.number).padStart(2, '0')}-${issue.date}.pdf"`,
  )
  return pdf
})
