export interface ChangelogSection {
  version: string
  date: string
  html: string
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function linkify(str: string): string {
  return str
    .replace(/\*\*([^*]+)\*\*/g, '<span class="font-medium">$1</span>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-sienna dark:text-sienna-light hover:underline">$1</a>',
    )
}

function markdownToHtml(md: string): string {
  let html = ''
  const lines = md.split('\n')
  let inList = false

  for (const line of lines) {
    if (line.startsWith('### ')) {
      if (inList) {
        html += '</ul>'
        inList = false
      }
      html += `<h4 class="font-semibold mt-3 mb-1">${escapeHtml(line.slice(4))}</h4>`
    } else if (line.startsWith('* ')) {
      if (!inList) {
        html += '<ul class="list-disc pl-5 space-y-0.5">'
        inList = true
      }
      html += `<li>${linkify(escapeHtml(line.slice(2)))}</li>`
    } else if (line.trim() === '') {
      if (inList) {
        html += '</ul>'
        inList = false
      }
    }
  }
  if (inList) html += '</ul>'

  return html
}

export function parseChangelog(raw: string): ChangelogSection[] {
  const versionBlocks = raw.split(/^## /m).slice(1)

  return versionBlocks.map((block) => {
    const lines = block.split('\n')
    const header = lines[0]!
    // Handle both formats:
    // - release-please linked: [1.1.0](url) or [1.1.0](url) (2026-03-15)
    // - simple: 1.0.0 (2026-03-08)
    const linkedMatch = /^\[(.+?)\]\([^)]+\)(?:\s*\((.+?)\))?/.exec(header)
    const simpleMatch = !linkedMatch ? /^(.+?)\s*\((.+?)\)/.exec(header) : null
    const version = linkedMatch?.[1] ?? simpleMatch?.[1] ?? header
    const date = linkedMatch?.[2] ?? simpleMatch?.[2] ?? ''

    const content = lines.slice(1).join('\n').trim()
    const html = markdownToHtml(content)

    return { version, date, html }
  })
}
