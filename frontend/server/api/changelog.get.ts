import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

let cached: string | undefined

export default defineEventHandler(() => {
  if (!cached) {
    try {
      cached = readFileSync(resolve(process.cwd(), '../CHANGELOG.md'), 'utf-8')
    } catch {
      cached = '## 0.0.0\n\nNo changelog available.'
    }
  }
  return cached
})
