import { expect, test } from '@playwright/test'

import { deleteAllMail, preparePage, waitForMailFor } from './helpers/maildev'
import { COLD_START_MS, fillAndSubmit, loginViaMagicLink } from './helpers/session'
import { runSeedDemo, runSeedReset } from './helpers/stack'

import type { Page } from '@playwright/test'

/**
 * The feedback strecke against the real stack: the form in a real browser, the
 * real endpoint, real SMTP, and the pug template with the real translations.
 *
 * What only this suite can show: that the mail the team receives actually says
 * what the member filled in. The unit tests mock the renderer away, and the
 * template's own spec renders it with locals a spec author chose — here the
 * locals come from a browser.
 *
 * `FEEDBACK_EMAIL=feedback@example.com` and `FEEDBACK_RATE_LIMIT_MS=0` come from
 * playwright.full-stack.config.ts: the team inbox is maildev, and the cooldown
 * is off so the tests can send one after another.
 */
const TEAM_INBOX = 'feedback@example.com'

// One seeded account per test, following the rest of the suite: a login per
// test keeps them independent, and each account has its own mail in maildev.
const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
const CAROL = 'carol@example.com'

test.beforeAll(() => {
  runSeedReset()
  runSeedDemo()
})

test.beforeEach(async () => {
  await deleteAllMail()
})

/** Open the feedback form the way a member does: through the side menu. */
async function openFeedbackForm(page: Page): Promise<void> {
  await page.goto('/projekt/feedback')
  await preparePage(page)
  // The form only appears once the availability check has answered.
  await expect(page.locator('#feedback-message')).toBeVisible({ timeout: COLD_START_MS })
}

/** `2026-11-05T19:00` → `05.11.2026, 19:00`, the way the mail spells it. */
function asGermanDateTime(localDateTime: string): string {
  const [date, time] = localDateTime.split('T')
  const [year, month, day] = date!.split('-')
  return `${day}.${month}.${year}, ${time}`
}

test.describe('feedback', () => {
  test('suggests an event from the calendar and mails it to the team', async ({ page }) => {
    await loginViaMagicLink(page, ALICE)

    // The "+" in the corner of the calendar — the whole point of this test is
    // that it arrives at a form which is already set up for a suggestion.
    const suggest = page.locator('a.cal-add')
    await expect(suggest).toBeVisible()
    await suggest.click()

    await expect(page).toHaveURL(/\/projekt\/feedback\?kind=event&date=\d{4}-\d{2}-\d{2}$/)
    await preparePage(page)
    await expect(page.locator('input[name="kind"][value="event"]')).toBeChecked()

    // Prefilled from the month the calendar was showing: 19:00, two hours long.
    const start = await page.locator('#feedback-event-start').inputValue()
    const end = await page.locator('#feedback-event-end').inputValue()
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}T19:00$/)
    expect(end).toMatch(/^\d{4}-\d{2}-\d{2}T21:00$/)

    await fillAndSubmit(page, {
      fields: [
        [page.locator('#feedback-event-title'), 'Chorprobe'],
        [page.locator('#feedback-event-location'), 'Gemeindehaus'],
        [page.locator('#feedback-message'), 'Bitte Noten mitbringen.'],
      ],
      button: 'Absenden',
      api: '/api/feedback',
    })

    await expect(page.getByText('Dein Terminvorschlag ist unterwegs')).toBeVisible({
      timeout: COLD_START_MS,
    })

    const mail = await waitForMailFor(TEAM_INBOX)
    expect(mail.subject).toBe('Jahrweiser: Terminvorschlag — Alice Example')
    const html = mail.html ?? ''
    expect(html).toContain('Chorprobe')
    expect(html).toContain('Gemeindehaus')
    expect(html).toContain('Bitte Noten mitbringen.')
    // The times the member saw, in the wall-clock reading the form sent them in
    // — the server reformats these strings and never parses them into a date.
    expect(html).toContain(asGermanDateTime(start))
    expect(html).toContain(asGermanDateTime(end))
    // Who suggested it, so the team can ask back.
    expect(html).toContain(ALICE)
    // A suggestion is not reproduced, so none of the bug-report context travels.
    expect(html).not.toContain('Fenstergröße')
  })

  test('mails plain feedback with nothing but who wrote it', async ({ page }) => {
    await loginViaMagicLink(page, BOB)
    await openFeedbackForm(page)

    await fillAndSubmit(page, {
      fields: [[page.locator('#feedback-message'), 'Der Kalender ist eine große Hilfe.']],
      button: 'Absenden',
      api: '/api/feedback',
    })
    await expect(page.getByText('Deine Nachricht ist unterwegs')).toBeVisible({
      timeout: COLD_START_MS,
    })

    const mail = await waitForMailFor(TEAM_INBOX)
    expect(mail.subject).toBe('Jahrweiser: Feedback — Bob Example')
    const html = mail.html ?? ''
    expect(html).toContain('Der Kalender ist eine große Hilfe.')
    expect(html).toContain(BOB)
    // Data with no purpose is data not collected — and not sent either.
    for (const label of ['Browser', 'Fenstergröße', 'Darstellung', 'Titel', 'Beginn']) {
      expect(html).not.toContain(label)
    }
  })

  test('mails a bug report with the environment it happened in', async ({ page }) => {
    await loginViaMagicLink(page, CAROL)
    // Navigate there the way a member does, through the icon rail and the
    // section's own submenu: the reported page comes from the history entry,
    // which only exists after real navigations.
    await page.locator('nav[aria-label="Hauptnavigation"] a[href="/projekt"]').first().click()
    await expect(page).toHaveURL(/\/projekt$/)
    await page.getByRole('link', { name: 'Feedback' }).first().click()
    await expect(page).toHaveURL(/\/projekt\/feedback$/)
    await preparePage(page)
    await expect(page.locator('#feedback-message')).toBeVisible({ timeout: COLD_START_MS })

    await page.locator('input[name="kind"][value="bug"]').check()
    // Everything the report will carry is on screen before it is sent.
    const shown = page.locator('details')
    await shown.click()
    await expect(shown).toContainText('Carol Example')

    await fillAndSubmit(page, {
      fields: [[page.locator('#feedback-message'), 'Die Karte lädt nicht.']],
      button: 'Absenden',
      api: '/api/feedback',
    })
    await expect(page.getByText('Deine Nachricht ist unterwegs')).toBeVisible({
      timeout: COLD_START_MS,
    })

    const mail = await waitForMailFor(TEAM_INBOX)
    expect(mail.subject).toBe('Jahrweiser: Fehlerbericht — Carol Example')
    const html = mail.html ?? ''
    expect(html).toContain('Die Karte lädt nicht.')
    // The technical half, which only a bug report gets — including the page the
    // member came from, taken from the history rather than from a form field.
    expect(html).toContain('Fenstergröße')
    expect(html).toContain('Browser')
    expect(html).toContain('/projekt')
  })
})
