import { expect, test } from '@playwright/test'

import { DEFAULT_USER, loginAs, mockFeedbackEndpoints, waitForHydration } from './helpers/api-mocks'

import type { Locator } from '@playwright/test'

/**
 * The calendar's "+" in a real browser, with the real stylesheet.
 *
 * The unit tests can prove the link, the prefill and the CSS class. What they
 * cannot prove is the reason that class exists: the button and the legend share
 * the bottom edge of the calendar, and only a laid-out page says whether they
 * actually keep apart.
 */

/** `true` when the two rectangles share any pixel. */
async function overlaps(a: Locator, b: Locator): Promise<boolean> {
  const first = await a.boundingBox()
  const second = await b.boundingBox()
  if (!first || !second) return false
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  )
}

test.describe('Suggest an event', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, DEFAULT_USER)
  })

  test('leads from the calendar to a form that is already set up for it', async ({ page }) => {
    await mockFeedbackEndpoints(page)
    await waitForHydration(page)

    const suggest = page.locator('a.cal-add')
    await expect(suggest).toBeVisible()
    // Icon only, so the name has to come from the label.
    await expect(suggest).toHaveAttribute('aria-label', 'Termin vorschlagen')
    await suggest.click()

    await expect(page).toHaveURL(/\/projekt\/feedback\?kind=event&date=\d{4}-\d{2}-\d{2}$/)
    await waitForHydration(page)

    // Preselected, named after what it is, and dated — only the title is left.
    await expect(page.locator('input[name="kind"][value="event"]')).toBeChecked()
    await expect(page.getByRole('heading', { name: 'Termin vorschlagen' })).toBeVisible()
    const today = new Date().toLocaleDateString('sv-SE')
    await expect(page.locator('#feedback-event-start')).toHaveValue(`${today}T19:00`)
    await expect(page.locator('#feedback-event-end')).toHaveValue(`${today}T21:00`)
    await expect(page.getByRole('button', { name: 'Absenden' })).toBeDisabled()
  })

  test('keeps clear of the calendar legend when it unfolds', async ({ page }) => {
    // The legend's trigger zone is the bottom edge of the calendar, and that
    // edge can sit past the fold: `.content` scrolls. Give the page room and
    // scroll to the end, so the cursor below can actually reach the edge.
    await page.setViewportSize({ width: 1280, height: 1400 })
    await waitForHydration(page)
    await page.locator('.content').evaluate((el) => {
      el.scrollTo({ top: el.scrollHeight })
    })

    const wrapper = page.locator('.cal-wrapper')
    const suggest = page.locator('a.cal-add')
    const legend = page.locator('.cal-legend-inner')

    // Closed, the legend is a zero-height strip; the button sits in the corner.
    const box = (await wrapper.boundingBox())!
    const buttonBox = (await suggest.boundingBox())!
    expect(buttonBox.x).toBeGreaterThan(box.x + box.width / 2)
    expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(box.y + box.height)

    // Unfold it the way a member does — by moving the cursor down there.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 10)
    await expect(page.locator('.cal-legend')).toHaveClass(/cal-legend-open/)
    await expect(legend.getByText('Vereinskalender')).toBeVisible()

    // The raise is a transition, so give it room to land before judging it.
    await expect.poll(async () => overlaps(suggest, legend), { timeout: 5_000 }).toBe(false)
    // Still reachable, not pushed out of the calendar.
    await expect(suggest).toBeVisible()
    const raised = (await suggest.boundingBox())!
    expect(raised.y).toBeLessThan(buttonBox.y)
    expect(raised.y).toBeGreaterThanOrEqual(box.y)
  })

  test('sends what the member filled in', async ({ page }) => {
    const sent = await mockFeedbackEndpoints(page)
    await waitForHydration(page)
    await page.locator('a.cal-add').click()
    await waitForHydration(page)

    await page.locator('#feedback-event-title').fill('Chorprobe')
    await page.locator('#feedback-event-location').fill('Gemeindehaus')
    await page.locator('#feedback-message').fill('Bitte Noten mitbringen.')
    const start = await page.locator('#feedback-event-start').inputValue()
    const end = await page.locator('#feedback-event-end').inputValue()

    await page.getByRole('button', { name: 'Absenden' }).click()
    await expect(page.getByText('Dein Terminvorschlag ist unterwegs')).toBeVisible()

    expect(sent).toHaveLength(1)
    expect(sent[0]).toEqual({
      kind: 'event',
      message: 'Bitte Noten mitbringen.',
      event: { title: 'Chorprobe', start, end, location: 'Gemeindehaus' },
    })
    // Emptied afterwards, so a second thought is a new suggestion.
    await expect(page.locator('#feedback-event-title')).toHaveValue('')
  })
})
