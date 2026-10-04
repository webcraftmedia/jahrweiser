/**
 * The version history as members see it: one entry per minor release, with its
 * patch releases folded in and everything that only concerns the build, the
 * deployment or the repository left out.
 *
 * CHANGELOG.md (written by release-please) stays the single source; the server
 * parses it once and the changelog modal only renders the result.
 */
export interface ChangelogEntry {
  text: string
  /** The pull request (or issue) the entry came from, if the line links one. */
  link?: { label: string; url: string }
}

export interface ChangelogRelease {
  /** `major.minor`, or the raw heading for anything that is not semver. */
  version: string
  /** Every release folded into this one, oldest first. */
  versions: string[]
  /** ISO dates of the oldest and the newest folded release; empty if unknown. */
  dateFrom: string
  dateTo: string
  features: ChangelogEntry[]
  fixes: ChangelogEntry[]
}

export interface Changelog {
  releases: ChangelogRelease[]
  /** How many older releases were cut off by the limit. */
  older: number
}

/**
 * Commit scopes whose changes never reach a member's screen. Unscoped entries
 * and the remaining scopes (app, db, admin and the legacy frontend/backend) are
 * shown.
 */
export const INTERNAL_SCOPES: ReadonlySet<string> = new Set([
  'deps',
  'docker',
  'docu',
  'infra',
  'other',
  'release',
  'workflow',
  'workflows',
])

const FEATURE_HEADINGS = new Set(['Features'])
const FIX_HEADINGS = new Set(['Bug Fixes', 'Performance Improvements'])

interface VersionBlock {
  version: string
  date: string
  features: ChangelogEntry[]
  fixes: ChangelogEntry[]
}

function parseHeader(header: string): { version: string; date: string } {
  // Handle both formats:
  // - release-please linked: [1.1.0](url) or [1.1.0](url) (2026-03-15)
  // - simple: 1.0.0 (2026-03-08)
  // eslint-disable-next-line security/detect-unsafe-regex
  const linkedMatch = /^\[([^\]]+)\]\([^)]+\)(?:\s+\(([^)]+)\))?/.exec(header)
  const simpleMatch = !linkedMatch ? /^(.+?)\s*\((.+?)\)/.exec(header) : null
  return {
    version: (linkedMatch?.[1] ?? simpleMatch?.[1] ?? header).trim(),
    date: linkedMatch?.[2] ?? simpleMatch?.[2] ?? '',
  }
}

/**
 * Turns `**app:** user search ([#429](…/issues/429)) ([0d79cfd](…/commit/…))`
 * into `{ text: 'User search', link: { label: '#429', url: '…/issues/429' } }`,
 * or null for an internal
 * scope.
 */
export function parseEntry(line: string): ChangelogEntry | null {
  let rest = line.trim()
  const scope = /^\*\*([^*:]+):\*\*\s*/.exec(rest)
  if (scope) {
    if (INTERNAL_SCOPES.has(scope[1]!.trim().toLowerCase())) return null
    rest = rest.slice(scope[0].length)
  }

  // release-please appends the PR and the commit as `([label](url))` groups.
  let link: ChangelogEntry['link']
  const trailing = /\s*\(\[([^\]]*)\]\((https?:\/\/[^)]+)\)\)\s*$/
  for (let match = trailing.exec(rest); match; match = trailing.exec(rest)) {
    if (/\/(?:issues|pull)\/\d+$/.test(match[2]!)) link = { label: match[1]!, url: match[2]! }
    rest = rest.slice(0, match.index)
  }

  const text = rest
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
  if (!text) return null
  return { text: text.charAt(0).toUpperCase() + text.slice(1), ...(link && { link }) }
}

function parseBlock(block: string): VersionBlock {
  const [header = '', ...lines] = block.split('\n')
  const result: VersionBlock = { ...parseHeader(header), features: [], fixes: [] }
  let target: ChangelogEntry[] | null = null

  for (const line of lines) {
    if (line.startsWith('### ')) {
      const heading = line.slice(4).trim()
      target = FEATURE_HEADINGS.has(heading)
        ? result.features
        : FIX_HEADINGS.has(heading)
          ? result.fixes
          : null
    } else if (line.startsWith('* ') && target) {
      const entry = parseEntry(line.slice(2))
      if (entry) target.push(entry)
    }
  }
  return result
}

function minorOf(version: string): string {
  const semver = /^(\d+)\.(\d+)\.\d+/.exec(version)
  return semver ? `${semver[1]}.${semver[2]}` : version
}

function pushUnique(into: ChangelogEntry[], entries: ChangelogEntry[]) {
  for (const entry of entries) {
    if (!into.some((existing) => existing.text === entry.text)) into.push(entry)
  }
}

/**
 * Parses a release-please CHANGELOG.md (newest release first) into one release
 * per minor version, newest first, and keeps the latest `limit` of them.
 */
export function parseChangelog(raw: string, limit = Infinity): Changelog {
  const releases: ChangelogRelease[] = []

  for (const block of raw.split(/^## /m).slice(1).map(parseBlock)) {
    const version = minorOf(block.version)
    let release = releases.at(-1)
    if (release?.version !== version) {
      release = {
        version,
        versions: [],
        dateFrom: block.date,
        dateTo: block.date,
        features: [],
        fixes: [],
      }
      releases.push(release)
    }
    // Blocks arrive newest first, so each one is older than the ones before.
    release.versions.unshift(block.version)
    if (block.date) {
      release.dateFrom = block.date
      release.dateTo ||= block.date
    }
    pushUnique(release.features, block.features)
    pushUnique(release.fixes, block.fixes)
  }

  const kept = releases.slice(0, limit)
  return { releases: kept, older: releases.length - kept.length }
}
