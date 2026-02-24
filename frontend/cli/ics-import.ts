import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, basename } from 'node:path'

import { glob } from 'tinyglobby'

import { runIcsImport } from './tools/ics-import-runner'

import type { ImportConfig } from './tools/ics-import-runner'

const args = process.argv.slice(2)

if (args.length === 0) {
  console.error('Usage: npx tsx cli/ics-import.ts <files-or-pattern>')
  console.error('')
  console.error('Arguments:')
  console.error('  files-or-pattern  Directory, glob pattern, or JSON file(s)')
  console.error('')
  console.error('Examples:')
  console.error('  npx tsx cli/ics-import.ts imports/')
  console.error('  npx tsx cli/ics-import.ts "imports/*.json"')
  console.error('  npx tsx cli/ics-import.ts ./imports/*.json')
  console.error('')
  console.error('Each JSON file should contain a single import configuration:')
  console.error('  {')
  console.error('    "url": "https://example.com/calendar.ics",')
  console.error('    "account": "accounts/account.json",')
  console.error('    "calendar": "Calendar Name"')
  console.error('  }')
  process.exit(1)
}

// Find all JSON files
let files: string[] = []

// Check if multiple arguments were passed (shell-expanded glob)
if (args.length > 1) {
  // Multiple files passed directly
  files = args.map((f) => resolve(process.cwd(), f)).sort()
} else {
  // Single argument: could be directory, glob pattern, or single file
  const pattern = args[0]!
  const resolvedPattern = resolve(process.cwd(), pattern)

  try {
    const stat = statSync(resolvedPattern)
    if (stat.isDirectory()) {
      // If it's a directory, find all .json files in it
      const entries = readdirSync(resolvedPattern)
      files = entries
        .filter((f) => f.endsWith('.json'))
        .map((f) => resolve(resolvedPattern, f))
        .sort()
    } else if (stat.isFile()) {
      // Single file
      files = [resolvedPattern]
    }
  } catch {
    // Not a directory or doesn't exist, treat as glob pattern
  }

  if (files.length === 0) {
    // Use glob pattern
    files = await glob(pattern, {
      cwd: process.cwd(),
      absolute: true,
    })
    files.sort()
  }
}

if (files.length === 0) {
  console.error(`No JSON files found matching: ${args.join(' ')}`)
  process.exit(1)
}

console.log(`Found ${files.length} import file(s)`)
console.log('')

let totalImported = 0
let totalSkipped = 0
let failures = 0

for (const [index, file] of files.entries()) {
  const filename = basename(file)
  console.log(`=== [${index + 1}/${files.length}] ${filename} ===`)

  let config: ImportConfig
  try {
    const configJson = readFileSync(file, 'utf-8')
    config = JSON.parse(configJson) as ImportConfig

    if (!config.url || !config.account || !config.calendar) {
      throw new Error('Missing required fields: url, account, calendar')
    }
  } catch (error) {
    console.error(`Failed to read config file: ${file}`)
    console.error(error)
    failures++
    console.log('')
    continue
  }

  console.log(`URL: ${config.url}`)
  console.log(`Account: ${config.account}`)
  console.log(`Calendar: ${config.calendar}`)
  console.log('')

  const result = await runIcsImport(config)

  if (result.success) {
    console.log(`Result: ${result.imported} imported, ${result.skipped} skipped`)
    totalImported += result.imported
    totalSkipped += result.skipped
  } else {
    console.error(`Failed: ${result.error}`)
    failures++
  }

  console.log('')
}

console.log('=== Summary ===')
console.log(`Total files: ${files.length}`)
console.log(`Successful: ${files.length - failures}`)
console.log(`Failed: ${failures}`)
console.log(`Events imported: ${totalImported}`)
console.log(`Events skipped: ${totalSkipped}`)

if (failures > 0) {
  process.exit(1)
}

process.exit(0)
