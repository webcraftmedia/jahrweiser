// @vitest-environment node
import path from 'node:path'

import Email from 'email-templates'
import { describe, it, expect } from 'vitest'

/**
 * Renders the feedback template for real — pug, layout, locale file and all.
 *
 * The endpoint's own spec mocks the renderer away, so nothing else here would
 * notice a pug syntax error, a locale key that does not exist, or the one thing
 * this template has to get right: a report is member-written text, and it is
 * printed with `=` so it cannot bring markup of its own into the operator's
 * mail client.
 */
const renderer = new Email({
  message: { from: { name: 'Jahrweiser', address: 'admin@example.com' } },
  send: false,
  preview: false,
  juice: false,
  i18n: {
    locales: ['de'],
    defaultLocale: 'de',
    retryInDefaultLocale: false,
    directory: path.join(process.cwd(), 'server/emails/_locales'),
    updateFiles: false,
    objectNotation: true,
    mustacheConfig: { tags: ['{', '}'] as [string, string], disable: false },
  },
})

const TEMPLATE = path.join(process.cwd(), 'server/emails/feedback')

const LOCALS = {
  locale: 'de',
  APPLICATION_NAME: 'Jahrweiser',
  ORGANIZATION_NAME: 'GG&G',
  ORGANIZATION_URL: 'http://localhost:3000',
  welcomeImageUrl: 'http://localhost:3000/logo.png',
  SUPPORT_EMAIL: '',
  name: '',
  alwaysSalutation: true,
  isBug: false,
  message: 'Die Karte lädt nicht.',
  senderName: 'Anna Mustermann',
  senderEmail: 'anna@example.com',
  senderUid: 'u1',
  senderRole: 'user',
  page: '/2026/09',
  appVersion: '1.14.4',
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
  viewport: '1280×800',
  colorScheme: 'hell',
  sentAt: '21.09.2026, 18:30:00',
}

async function render(locals: Record<string, unknown> = {}) {
  return renderer.renderAll(TEMPLATE, { ...LOCALS, ...locals })
}

describe('emails/feedback', () => {
  it('carries the report and its context', async () => {
    const { subject, html } = await render()
    expect(subject).toBe('Jahrweiser: Feedback — Anna Mustermann')
    expect(html).toContain('Die Karte lädt nicht.')
    for (const value of ['Anna Mustermann', 'anna@example.com', 'u1', '/2026/09', '1.14.4']) {
      expect(html).toContain(value)
    }
  })

  it('subjects a bug report as one', async () => {
    const { subject } = await render({ isBug: true })
    expect(subject).toBe('Jahrweiser: Fehlerbericht — Anna Mustermann')
  })

  it('leaves the dash off when there is no name to put behind it', async () => {
    const { subject } = await render({ senderName: '' })
    expect(subject).toBe('Jahrweiser: Feedback')
  })

  it('escapes what the member wrote instead of rendering it', async () => {
    const { html } = await render({
      message: '<img src=x onerror="alert(1)"> & <b>fett</b>',
      senderName: '<script>alert(2)</script>',
    })
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script>alert(2)</script>')
    expect(html).toContain('&lt;img src=x')
    expect(html).toContain('&amp;')
  })

  it('omits the support block — the mail already goes to the team', async () => {
    const { html } = await render()
    expect(html).not.toContain('mailto:')
  })
})
