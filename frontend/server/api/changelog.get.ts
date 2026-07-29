import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

let cached: string | undefined

export default defineEventHandler(async () => {
  if (!cached) {
    try {
      cached = await readFile(resolve(process.cwd(), '../CHANGELOG.md'), 'utf-8')
    } catch (error) {
      // A missing CHANGELOG.md is expected in deployments that ship without it.
      // Anything else (permissions, I/O) is a real fault and must surface.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      cached = '## 0.0.0\n\nNo changelog available.'
    }
  }
  return cached
})
