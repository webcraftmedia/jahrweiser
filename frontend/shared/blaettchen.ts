/**
 * One issue of the "Blättche", derived entirely from its file name — the PDFs
 * are dropped into the directory by hand, and a second place to maintain (a
 * manifest) would only be a second place to forget.
 *
 * Convention: `NN_YYYY-MM-DD[_Titel].pdf`
 *   11_2025-12-24.pdf
 *   04_2023-12-23_Sonderausgabe Weihnachten.pdf
 *
 * The number is the issue number printed in the paper itself, the date its
 * publication date, the optional title a subtitle for special editions.
 */
export interface BlaettchenIssue {
  /** Issue number as printed in the paper. Gaps are normal — not every issue is archived. */
  number: number
  /** Publication date, `YYYY-MM-DD`. */
  date: string
  /** Optional subtitle, e.g. "Sonderausgabe Weihnachten". */
  title?: string
  /** File name, also the path segment of the download URL. */
  file: string
}

export interface BlaettchenListing {
  /** Newest issue first. */
  issues: BlaettchenIssue[]
  /**
   * Address for contributions to the next issue. Private, hence never in the
   * repository; `null` when unconfigured, in which case the page skips the
   * call for contributions rather than showing a dead link.
   */
  contact: string | null
}

const EXTENSION = '.pdf'
const NUMBER_PATTERN = /^\d{2,3}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parses a file name into an issue, or returns `null` when it does not follow
 * the convention. Shared by the listing endpoint and the download endpoint:
 * a name that survives this is separator-free and therefore cannot address
 * anything outside the issue directory, which is what makes it safe to use a
 * request-supplied name for a file system lookup at all.
 *
 * Split by hand rather than matched by one regex: the parts are trivially
 * verifiable this way, and there is no backtracking behaviour to reason about
 * on a string that comes straight from a request.
 */
export function parseBlaettchenFile(file: string): BlaettchenIssue | null {
  // A path separator would let the name leave the directory. Rejected first,
  // before anything else looks at the name.
  if (file.includes('/') || file.includes('\\')) return null
  if (!file.toLowerCase().endsWith(EXTENSION)) return null

  const [number, date, ...titleParts] = file.slice(0, -EXTENSION.length).split('_')
  if (!number || !NUMBER_PATTERN.test(number)) return null
  if (!date || !DATE_PATTERN.test(date)) return null

  // `new Date` rolls over out-of-range days (Feb 30 → Mar 2), so compare the
  // round-trip: only a real calendar date survives it unchanged.
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null

  // Rejoined, because a subtitle may well contain an underscore itself.
  const title = titleParts.join('_')
  // `12_2026-05-01_.pdf` is a malformed name, not a titleless issue.
  if (titleParts.length > 0 && title.length === 0) return null

  return {
    number: Number(number),
    date,
    ...(title ? { title } : {}),
    file,
  }
}

/**
 * Newest first: by issue number, and by date where a number repeats (a
 * corrected reissue keeps its number).
 */
export function compareBlaettchenIssues(a: BlaettchenIssue, b: BlaettchenIssue): number {
  return b.number - a.number || b.date.localeCompare(a.date)
}
