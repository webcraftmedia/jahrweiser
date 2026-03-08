import { describe, expect, it } from 'vitest'

import { parseChangelog } from './parseChangelog'

describe('parseChangelog', () => {
  it('parses version, date, and content', () => {
    const result = parseChangelog('## 1.0.0 (2026-03-08)\n\n### Features\n\n* item one\n')
    expect(result).toHaveLength(1)
    expect(result[0]!.version).toBe('1.0.0')
    expect(result[0]!.date).toBe('2026-03-08')
    expect(result[0]!.html).toContain('Features')
    expect(result[0]!.html).toContain('item one')
  })

  it('parses multiple versions', () => {
    const md = '## 2.0.0 (2026-06-01)\n\n* feat\n\n## 1.0.0 (2026-03-08)\n\n* fix\n'
    const result = parseChangelog(md)
    expect(result).toHaveLength(2)
    expect(result[0]!.version).toBe('2.0.0')
    expect(result[1]!.version).toBe('1.0.0')
  })

  it('converts **bold** to font-medium spans', () => {
    const result = parseChangelog('## 1.0.0 (2026-01-01)\n\n* **scope:** text\n')
    expect(result[0]!.html).toContain('<span class="font-medium">scope:</span>')
  })

  it('converts markdown links to anchor tags', () => {
    const result = parseChangelog(
      '## 1.0.0 (2026-01-01)\n\n* fix ([#1](https://github.com/org/repo/issues/1))\n',
    )
    expect(result[0]!.html).toContain('href="https://github.com/org/repo/issues/1"')
    expect(result[0]!.html).toContain('target="_blank"')
  })

  it('escapes HTML in content', () => {
    const result = parseChangelog('## 1.0.0 (2026-01-01)\n\n* fix <script>alert(1)</script>\n')
    expect(result[0]!.html).not.toContain('<script>')
    expect(result[0]!.html).toContain('&lt;script&gt;')
  })

  it('closes list before heading when no empty line separates them', () => {
    const md = [
      '## 1.0.0 (2026-01-01)',
      '',
      '### Features',
      '',
      '* feature one',
      '* feature two',
      '### Bug Fixes',
      '',
      '* fix one',
    ].join('\n')

    const result = parseChangelog(md)
    const html = result[0]!.html
    const bugFixesIdx = html.indexOf('Bug Fixes')
    const ulCloseIdx = html.lastIndexOf('</ul>', bugFixesIdx)
    expect(ulCloseIdx).toBeGreaterThan(-1)
    expect(ulCloseIdx).toBeLessThan(bugFixesIdx)
  })

  it('handles version without date', () => {
    const result = parseChangelog('## Unreleased\n\n* item\n')
    expect(result[0]!.version).toBe('Unreleased')
    expect(result[0]!.date).toBe('')
  })

  it('ignores non-markdown lines', () => {
    const result = parseChangelog('## 1.0.0 (2026-01-01)\n\nSome plain text\n* item\n')
    expect(result[0]!.html).toContain('item')
    expect(result[0]!.html).not.toContain('Some plain text')
  })

  it('closes list at end of input without trailing newline', () => {
    const result = parseChangelog('## 1.0.0 (2026-01-01)\n\n* last item')
    expect(result[0]!.html).toContain('</ul>')
    expect(result[0]!.html).toContain('last item')
  })

  it('handles content ending without open list', () => {
    const result = parseChangelog('## 1.0.0 (2026-01-01)\n\n### Features\n')
    expect(result[0]!.html).toContain('Features')
    expect(result[0]!.html).not.toContain('<ul')
  })
})
