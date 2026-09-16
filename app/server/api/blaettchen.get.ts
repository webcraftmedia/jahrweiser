import { readdir } from 'node:fs/promises'
import path from 'node:path'

import { compareBlaettchenIssues, parseBlaettchenFile } from '../../shared/blaettchen'

import type { BlaettchenIssue, BlaettchenListing } from '../../shared/blaettchen'

/**
 * The Blättchen issues shown on /blaettchen.
 *
 * Behind `requireUserSession` on purpose: the paper is written by and for the
 * members, contains their names, photos and addresses, and is not published on
 * the open web. The same holds for the contact address, which is why it travels
 * through this endpoint rather than `runtimeConfig.public` — the latter ends up
 * in the client bundle, readable by any anonymous visitor in the page source.
 *
 * The directory is git-ignored (see .gitignore), so no issue ever reaches the
 * repository. Deliberately not cached: dropping a PDF into the directory
 * publishes it immediately, no deploy and no restart. The listing is a single
 * readdir over a handful of files.
 */
export default defineEventHandler(async (event): Promise<BlaettchenListing> => {
  await requireUserSession(event)

  const config = useRuntimeConfig()
  const dir = path.resolve(process.cwd(), config.BLAETTCHEN_DIR)
  const contact = config.BLAETTCHEN_CONTACT_EMAIL || null

  let entries: string[]
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad stammt aus der runtimeConfig (Betreiber-Konfiguration), nicht aus einer Anfrage
    entries = await readdir(dir)
  } catch (error) {
    // Not configured yet is a legitimate state — the page shows its empty
    // message and still asks for contributions. Anything other than "directory
    // missing" is a real problem worth surfacing rather than swallowing.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { issues: [], contact }
    console.error(`Failed to read Blättchen issues from ${dir}:`, error)
    throw createError({ statusCode: 500, statusMessage: 'Blaettchen issues unreadable' })
  }

  const issues: BlaettchenIssue[] = []
  const ignored: string[] = []
  for (const entry of entries) {
    const issue = parseBlaettchenFile(entry)
    if (issue) issues.push(issue)
    else ignored.push(entry)
  }

  // A stray file (a draft, a .DS_Store, a typo in the name) must not take the
  // whole archive down — unlike the hand-written Telegram JSON, this directory
  // is filled by copying files around. It is still logged, because a silently
  // skipped issue is exactly the kind of thing nobody notices.
  if (ignored.length > 0) {
    console.warn(
      `Ignoring ${ignored.length} file(s) in ${dir} that do not follow NN_YYYY-MM-DD[_Titel].pdf:`,
      ignored.join(', '),
    )
  }

  return { issues: issues.sort(compareBlaettchenIssues), contact }
})
