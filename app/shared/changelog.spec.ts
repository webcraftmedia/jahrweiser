import { describe, expect, it } from 'vitest'

import { parseChangelog, parseEntry } from './changelog'

const PR = 'https://github.com/org/repo/issues/429'
const COMMIT = 'https://github.com/org/repo/commit/0d79cfd'

describe('parseEntry', () => {
  it('strips the scope, the PR and the commit and keeps the PR link', () => {
    expect(parseEntry(`**app:** user search ([#429](${PR})) ([0d79cfd](${COMMIT}))`)).toStrictEqual(
      {
        text: 'User search',
        link: { label: '#429', url: PR },
      },
    )
  })

  it('accepts pull request links', () => {
    const url = 'https://github.com/org/repo/pull/7'
    expect(parseEntry(`**db:** faster ([#7](${url}))`)?.link).toStrictEqual({ label: '#7', url })
  })

  it('keeps entries without a link or a scope', () => {
    expect(parseEntry('plain change')).toStrictEqual({ text: 'Plain change' })
  })

  it.each(['workflow', 'workflows', 'infra', 'docker', 'other', 'deps', 'docu', 'release'])(
    'drops the internal scope %s',
    (scope) => {
      expect(parseEntry(`**${scope}:** something`)).toBeNull()
    },
  )

  it('matches scopes case-insensitively', () => {
    expect(parseEntry('**Infra:** something')).toBeNull()
  })

  it('keeps the legacy frontend and backend scopes', () => {
    expect(parseEntry('**frontend:** map')?.text).toBe('Map')
    expect(parseEntry('**backend:** login')?.text).toBe('Login')
  })

  it('flattens markdown inside the text', () => {
    expect(parseEntry('see **this** and [that](https://example.org)')?.text).toBe(
      'See this and that',
    )
  })

  it('drops entries that are empty once the links are gone', () => {
    expect(parseEntry(`**app:** ([#429](${PR}))`)).toBeNull()
  })
})

const CHANGELOG = [
  '# Changelog',
  '',
  '## [1.15.2](https://github.com/org/repo/compare/v1.15.1...v1.15.2) (2026-09-26)',
  '',
  '### Bug Fixes',
  '',
  `* **app:** browser polyfills ([#434](${PR}))`,
  '* **workflow:** env loading',
  '',
  '## [1.15.1](https://github.com/org/repo/compare/v1.15.0...v1.15.1) (2026-09-24)',
  '',
  '### Bug Fixes',
  '',
  '* **app:** browser polyfills',
  '',
  '## [1.15.0](https://github.com/org/repo/compare/v1.14.0...v1.15.0) (2026-09-20)',
  '',
  '### Features',
  '',
  '* **app:** user search',
  '',
  '### Performance Improvements',
  '',
  '* **app:** faster map',
  '',
  '### Miscellaneous Chores',
  '',
  '* **app:** bump things',
  '',
  '## [1.14.0](https://github.com/org/repo/compare/v1.13.0...v1.14.0) (2026-09-13)',
  '',
  '### Bug Fixes',
  '',
  '* **infra:** pm2 name',
  '',
  '## 1.13.0 (2026-09-01)',
  '',
  '### Features',
  '',
  '* first',
].join('\n')

describe('parseChangelog', () => {
  it('folds patch releases into their minor release', () => {
    const { releases, older } = parseChangelog(CHANGELOG)
    expect(older).toBe(0)
    expect(releases.map((release) => release.version)).toStrictEqual(['1.15', '1.14', '1.13'])
    expect(releases[0]).toStrictEqual({
      version: '1.15',
      versions: ['1.15.0', '1.15.1', '1.15.2'],
      dateFrom: '2026-09-20',
      dateTo: '2026-09-26',
      features: [{ text: 'User search' }],
      fixes: [
        { text: 'Browser polyfills', link: { label: '#434', url: PR } },
        { text: 'Faster map' },
      ],
    })
  })

  it('ignores sections that are neither features nor fixes', () => {
    const [release] = parseChangelog(CHANGELOG).releases
    expect(release!.fixes.map((fix) => fix.text)).not.toContain('Bump things')
  })

  it('keeps a release whose entries are all internal', () => {
    const release = parseChangelog(CHANGELOG).releases[1]!
    expect(release.features).toStrictEqual([])
    expect(release.fixes).toStrictEqual([])
  })

  it('parses the simple header format', () => {
    const release = parseChangelog(CHANGELOG).releases[2]!
    expect(release.versions).toStrictEqual(['1.13.0'])
    expect(release.dateFrom).toBe('2026-09-01')
    expect(release.features).toStrictEqual([{ text: 'First' }])
  })

  it('cuts off older releases at the limit and counts them', () => {
    const { releases, older } = parseChangelog(CHANGELOG, 1)
    expect(releases.map((release) => release.version)).toStrictEqual(['1.15'])
    expect(older).toBe(2)
  })

  it('keeps non-semver headings as their own release', () => {
    const { releases } = parseChangelog('## Unreleased\n\n### Features\n\n* soon\n')
    expect(releases[0]).toMatchObject({ version: 'Unreleased', dateFrom: '', dateTo: '' })
  })

  it('fills the dates from whichever folded release has one', () => {
    const md = '## [1.2.1](https://x.org/c)\n\n## [1.2.0](https://x.org/c) (2026-01-02)\n'
    const [release] = parseChangelog(md).releases
    expect(release).toMatchObject({ dateFrom: '2026-01-02', dateTo: '2026-01-02' })
  })

  it('returns nothing for a changelog without releases', () => {
    expect(parseChangelog('# Changelog\n')).toStrictEqual({ releases: [], older: 0 })
  })
})
