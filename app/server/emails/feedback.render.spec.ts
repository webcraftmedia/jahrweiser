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
  isBug: true,
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

/** What the endpoint adds for a suggested event, on top of the sender lines. */
const EVENT_LOCALS = {
  isBug: false,
  isEvent: true,
  eventTitle: 'Chorprobe',
  eventStart: '05.11.2026, 19:00',
  eventEnd: '05.11.2026, 21:00',
  eventLocation: 'Gemeindehaus',
}

describe('emails/feedback', () => {
  it('carries a bug report with its context', async () => {
    const { subject, html } = await render()
    expect(subject).toBe('Jahrweiser: Fehlerbericht — Anna Mustermann')
    expect(html).toContain('Die Karte lädt nicht.')
    for (const value of ['Anna Mustermann', 'anna@example.com', 'u1', '/2026/09', '1.14.4']) {
      expect(html).toContain(value)
    }
  })

  it('says so rather than trailing off when a context value is empty', async () => {
    // `page` stays empty whenever the form was opened directly instead of from
    // inside the app — a bookmark, a link in a chat. The form shows "keine
    // Angabe" there, and a label with nothing behind it in the mail reads like
    // a rendering fault rather than like the real state it is.
    const { html } = await render({ page: '' })
    expect(html).toContain('Seite')
    expect(html).toContain('keine Angabe')
  })

  it('prints no technical lines for plain feedback', async () => {
    // The endpoint sends no context for it; the template must not leave empty
    // rows where the browser and the window size used to be.
    const { subject, html } = await render({ isBug: false })
    expect(subject).toBe('Jahrweiser: Feedback — Anna Mustermann')
    expect(html).toContain('Anna Mustermann')
    for (const label of ['Browser', 'Fenstergröße', 'Darstellung', 'Seite', 'Version']) {
      expect(html).not.toContain(label)
    }
  })

  it('carries a suggested event with its times and place', async () => {
    const { subject, html } = await render({ ...EVENT_LOCALS, message: 'Bitte Noten mitbringen.' })
    expect(subject).toBe('Jahrweiser: Terminvorschlag — Anna Mustermann')
    for (const value of ['Chorprobe', '05.11.2026, 19:00', '05.11.2026, 21:00', 'Gemeindehaus']) {
      expect(html).toContain(value)
    }
    expect(html).toContain('Bitte Noten mitbringen.')
    // A suggestion is not reproduced, so the technical half stays away.
    for (const label of ['Browser', 'Fenstergröße', 'Darstellung']) {
      expect(html).not.toContain(label)
    }
  })

  it('leaves out the place and the description a suggestion did not have', async () => {
    // Both are optional — an empty row would look like a lost value.
    const { html } = await render({ ...EVENT_LOCALS, eventLocation: '', message: '' })
    expect(html).toContain('Chorprobe')
    expect(html).not.toContain('Ort')
    expect(html).not.toContain('Beschreibung')
  })

  it('escapes a suggested event as thoroughly as a message', async () => {
    const { html } = await render({
      ...EVENT_LOCALS,
      eventTitle: '<img src=x onerror="alert(1)">',
      eventLocation: '<b>Halle</b>',
    })
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>Halle</b>')
    expect(html).toContain('&lt;img src=x')
  })

  it('leaves the dash off when there is no name to put behind it', async () => {
    const { subject } = await render({ senderName: '' })
    expect(subject).toBe('Jahrweiser: Fehlerbericht')
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
