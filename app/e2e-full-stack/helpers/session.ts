import { expect } from '@playwright/test'

import { extractLoginTokenFromMail, openLoginLink, preparePage, waitForMailFor } from './maildev'

import type { Locator, Page } from '@playwright/test'

/**
 * Signing in, in one place.
 *
 * Every suite here starts by logging somebody in, and every suite used to carry
 * its own copy of this flow — nine of them, with the same two hard-coded
 * timeouts and the same race (see `fillAndSubmit`). One copy means a fix lands
 * everywhere instead of in whichever file somebody happened to be editing.
 */

/**
 * How long the *first* interaction of a run may take.
 *
 * The suite talks to a dev server: the first hit on a route compiles it, opens
 * the DAV connection and warms the pool. Configurable rather than a literal, so
 * a slow machine raises the number instead of adding a retry that hides what is
 * actually a cold start.
 */
export const COLD_START_MS = Number(process.env.E2E_COLD_START_MS ?? 30_000)

/** How long a submitted form gets to actually produce its request. */
const SUBMIT_MS = 5_000

/**
 * Fill a form and submit it, making sure the submission really happened.
 *
 * The race this exists for: a dev server that is still re-optimizing
 * dependencies re-renders the form and empties the fields, and a click a
 * moment later submits nothing. Client-side validation then refuses, *no
 * request goes out*, and the test waits for a confirmation that will never
 * come — which is what the login and registration flakes both were.
 *
 * Checking the typed value is not enough: the re-render can land between the
 * check and the click. So the pair is retried as one, and the criterion is the
 * request itself rather than anything on screen — that tells "the click was
 * swallowed" apart from "the server is slow", and only the first deserves
 * another go.
 */
export async function fillAndSubmit(
  page: Page,
  options: { fields: [Locator, string][]; button: string; api: string; attempts?: number },
): Promise<void> {
  const { fields, button, api, attempts = 3 } = options
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const submitted = page
      .waitForRequest((request) => request.url().includes(api), { timeout: SUBMIT_MS })
      .then(() => true)
      .catch(() => false)
    for (const [input, value] of fields) {
      await input.fill(value)
    }
    await page.getByRole('button', { name: button }).click()
    if (await submitted) return
    // Swallowed. Let the page settle and type it again.
    await preparePage(page)
  }
  throw new Error(`"${button}" never produced a request to ${api} in ${attempts} attempts`)
}

/**
 * Ask for a magic link and wait for the page to confirm it was sent.
 *
 * Separate from the login below because two tests need exactly this much: the
 * one that checks an unknown address produces no mail, and the one that spends
 * a token twice.
 */
export async function requestLoginLink(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await preparePage(page)
  await fillAndSubmit(page, {
    fields: [[page.locator('#email-address-icon'), email]],
    button: 'Einloggen',
    api: '/api/requestLoginLink',
  })
  await expect(page.getByText('Prüfe dein Postfach')).toBeVisible({ timeout: COLD_START_MS })
}

/** Request a link, open it, confirm it — and land on the calendar. */
export async function loginViaMagicLink(page: Page, email: string): Promise<void> {
  await requestLoginLink(page, email)
  const mail = await waitForMailFor(email, COLD_START_MS)
  await openLoginLink(page, extractLoginTokenFromMail(mail))
  await expect(page).toHaveURL(/\/\d{4}\/\d{2}$/, { timeout: COLD_START_MS })
}
