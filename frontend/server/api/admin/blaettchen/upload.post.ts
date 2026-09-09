import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { z } from 'zod'

import type { BlaettchenIssue } from '~~/shared/blaettchen'

import {
  BLAETTCHEN_MAX_BYTES,
  formatBlaettchenFile,
  parseBlaettchenFile,
  PDF_MAGIC,
} from '~~/shared/blaettchen'

/**
 * Uploads one issue of the Blättchen.
 *
 * The file name the browser sends is never used as a path: the name is built
 * server-side from the validated fields and then parsed back with the very
 * grammar the reading endpoints use, so nothing can be written that could not
 * be listed and served again.
 *
 * Admin-only. Publishing is an editorial act, and the endpoint writes into the
 * directory that /blaettchen serves.
 */
const fieldsSchema = z.object({
  // Multipart fields arrive as strings; the number is the issue number printed
  // in the paper.
  number: z.coerce.number().int().min(1).max(999),
  date: z.string(),
  title: z.string().trim().max(120).optional(),
  /** Set by the "replace existing issue" checkbox — never a default. */
  replace: z.enum(['true', 'false']).optional(),
})

interface UploadResult {
  issue: BlaettchenIssue
  /** File names removed because they carried the same issue number. */
  replaced: string[]
}

export default defineEventHandler(async (event): Promise<UploadResult> => {
  const session = await requireUserSession(event)
  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not Authorized' })
  }

  const parts = (await readMultipartFormData(event)) ?? []
  const upload = parts.find((part) => part.name === 'file' && part.filename)
  if (!upload || upload.data.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No file' })
  }
  if (upload.data.length > BLAETTCHEN_MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'File too large' })
  }
  // The content type is whatever the browser claims. The magic bytes are what
  // the file actually is — and the archive may only ever contain PDFs, because
  // that is what the download endpoint promises its readers.
  if (!upload.data.subarray(0, PDF_MAGIC.length).toString('latin1').startsWith(PDF_MAGIC)) {
    throw createError({ statusCode: 415, statusMessage: 'Not a PDF' })
  }

  const fields = Object.fromEntries(
    parts
      .filter((part) => !part.filename && part.name)
      .map((part) => [part.name, part.data.toString('utf-8')]),
  )
  const parsedFields = fieldsSchema.safeParse(fields)
  if (!parsedFields.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid issue data' })
  }
  const { number, date, title, replace } = parsedFields.data

  // Round-trip through the name: whatever survives being formatted and parsed
  // again is exactly what the listing will later show. This is what rejects an
  // impossible date, a title with a separator in it, or one that is only
  // whitespace — no second set of rules to keep in sync.
  const file = formatBlaettchenFile({ number, date, ...(title ? { title } : {}) })
  const issue = parseBlaettchenFile(file)
  if (issue?.number !== number || issue.date !== date || (issue.title ?? '') !== (title ?? '')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid issue data' })
  }

  const config = useRuntimeConfig()
  const dir = path.resolve(process.cwd(), config.BLAETTCHEN_DIR)
  // The first upload may well be the one that creates the archive.
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad stammt aus der runtimeConfig (Betreiber-Konfiguration), nicht aus einer Anfrage
  await mkdir(dir, { recursive: true })
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dito
  const present = (await readdir(dir))
    .map(parseBlaettchenFile)
    .filter((entry): entry is BlaettchenIssue => entry !== null)

  // The issue number is the identity of an issue — two files claiming to be
  // the 12th would read as duplicates on the page, whatever their dates say.
  const clashes = present.filter((entry) => entry.number === issue.number)
  if (clashes.length > 0 && replace !== 'true') {
    throw createError({ statusCode: 409, statusMessage: 'Issue already exists' })
  }

  for (const clash of clashes) {
    // The target name itself is simply overwritten; only a differently named
    // file of the same issue has to go, or the number would appear twice.
    if (clash.file === issue.file) continue
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Name stammt aus dem Verzeichnis und ist durch parseBlaettchenFile validiert
    await unlink(path.join(dir, clash.file))
  }
  if (clashes.length > 0) {
    // Replacing destroys an issue. Whoever did it, and what went, belongs in
    // the log — the archive has no other history.
    console.warn(
      `Blättchen issue ${issue.number} replaced by ${session.user.email}, removed:`,
      clashes.map((clash) => clash.file).join(', '),
    )
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Name ist serverseitig gebaut und durch parseBlaettchenFile validiert
  await writeFile(path.join(dir, issue.file), upload.data)

  return { issue, replaced: clashes.map((clash) => clash.file) }
})
