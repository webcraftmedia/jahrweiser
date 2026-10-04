import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { parseChangelog } from '../../shared/changelog'

import type { Changelog } from '../../shared/changelog'

/** Minor releases shown in the modal; older ones are linked to on GitHub. */
const MAX_RELEASES = 5

let cached: Changelog | undefined

export default defineEventHandler(async (): Promise<Changelog> => {
  if (!cached) {
    try {
      const raw = await readFile(resolve(process.cwd(), '../CHANGELOG.md'), 'utf-8')
      cached = parseChangelog(raw, MAX_RELEASES)
    } catch (error) {
      // A missing CHANGELOG.md is expected in deployments that ship without it.
      // Anything else (permissions, I/O) is a real fault and must surface.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      cached = { releases: [], older: 0 }
    }
  }
  return cached
})
