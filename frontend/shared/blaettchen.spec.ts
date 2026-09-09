import { describe, expect, it } from 'vitest'

import { compareBlaettchenIssues, formatBlaettchenFile, parseBlaettchenFile } from './blaettchen'

import type { BlaettchenIssue } from './blaettchen'

describe('parseBlaettchenFile', () => {
  it('reads number and date from the file name', () => {
    expect(parseBlaettchenFile('11_2025-12-24.pdf')).toStrictEqual({
      number: 11,
      date: '2025-12-24',
      file: '11_2025-12-24.pdf',
    })
  })

  it('reads the optional title, spaces and all', () => {
    // Special editions carry a subtitle; it is shown verbatim, so it must
    // survive spaces and umlauts.
    expect(parseBlaettchenFile('04_2023-12-23_Sonderausgabe Weihnachten.pdf')).toStrictEqual({
      number: 4,
      date: '2023-12-23',
      title: 'Sonderausgabe Weihnachten',
      file: '04_2023-12-23_Sonderausgabe Weihnachten.pdf',
    })
  })

  it('omits the title rather than carrying an empty one', () => {
    // `_.pdf` would otherwise yield title: '' and render an empty line.
    expect(parseBlaettchenFile('05_2024-01-29_.pdf')).toBeNull()
  })

  it('accepts a three-digit number, so the archive does not cap at 99', () => {
    expect(parseBlaettchenFile('100_2030-01-01.pdf')?.number).toBe(100)
  })

  it('accepts the uppercase extension a scanner produces', () => {
    expect(parseBlaettchenFile('07_2024-07-13.PDF')?.number).toBe(7)
  })

  it.each([
    ['GG&G Blaettche 2025-12.pdf', 'the original, unrenamed name'],
    ['blaettchen.pdf', 'no number and no date'],
    ['11_2025-12-24.txt', 'not a PDF'],
    ['11_2025-12.pdf', 'an incomplete date'],
    ['1_2025-12-24.pdf', 'an unpadded number'],
    ['.DS_Store', 'a stray file the file manager left behind'],
    ['11_2025-13-01.pdf', 'a month that does not exist'],
    ['11_2025-02-30.pdf', 'a day the month does not have'],
  ])('ignores %s (%s)', (file) => {
    expect(parseBlaettchenFile(file)).toBeNull()
  })

  it.each([
    ['../../../etc/passwd', 'a bare traversal'],
    ['01_2023-06-06_../../etc/passwd.pdf', 'a traversal smuggled into the title'],
    ['01_2023-06-06_..\\..\\windows\\win.ini.pdf', 'a backslash traversal'],
    ['/etc/shadow.pdf', 'an absolute path'],
  ])('refuses %s (%s), so no name reaches the file system that could escape', (file) => {
    expect(parseBlaettchenFile(file)).toBeNull()
  })
})

describe('formatBlaettchenFile', () => {
  it('pads the number so the archive sorts as text too', () => {
    expect(formatBlaettchenFile({ number: 6, date: '2024-04-14' })).toBe('06_2024-04-14.pdf')
  })

  it('leaves a three-digit number alone', () => {
    expect(formatBlaettchenFile({ number: 100, date: '2030-01-01' })).toBe('100_2030-01-01.pdf')
  })

  it('appends the subtitle when there is one', () => {
    expect(
      formatBlaettchenFile({ number: 4, date: '2023-12-23', title: 'Sonderausgabe Weihnachten' }),
    ).toBe('04_2023-12-23_Sonderausgabe Weihnachten.pdf')
  })

  it('omits a subtitle that is only whitespace, separator and all', () => {
    // `04_2023-12-23_.pdf` is not a name the parser accepts.
    expect(formatBlaettchenFile({ number: 4, date: '2023-12-23', title: '  ' })).toBe(
      '04_2023-12-23.pdf',
    )
  })

  it('trims a subtitle rather than baking the spaces into the name', () => {
    expect(formatBlaettchenFile({ number: 4, date: '2023-12-23', title: ' Sommer ' })).toBe(
      '04_2023-12-23_Sommer.pdf',
    )
  })

  it.each([
    { number: 12, date: '2026-05-01' },
    { number: 4, date: '2023-12-23', title: 'Sonderausgabe Weihnachten' },
    { number: 100, date: '2030-01-01', title: 'Titel_mit_Unterstrich' },
  ])('round-trips %o through the parser', (issue) => {
    // The upload relies on exactly this: what it formats, the listing parses
    // back to the same issue.
    const parsed = parseBlaettchenFile(formatBlaettchenFile(issue))
    expect(parsed).toMatchObject(issue)
  })
})

describe('compareBlaettchenIssues', () => {
  function issue(number: number, date: string): BlaettchenIssue {
    return { number, date, file: `${number}_${date}.pdf` }
  }

  it('sorts the newest issue first', () => {
    const sorted = [issue(1, '2023-06-06'), issue(12, '2026-05-01'), issue(4, '2023-12-23')].sort(
      compareBlaettchenIssues,
    )
    expect(sorted.map((i) => i.number)).toStrictEqual([12, 4, 1])
  })

  it('leaves gaps alone — not every issue is archived', () => {
    const sorted = [issue(5, '2024-01-29'), issue(9, '2025-06-14'), issue(7, '2024-07-13')].sort(
      compareBlaettchenIssues,
    )
    expect(sorted.map((i) => i.number)).toStrictEqual([9, 7, 5])
  })

  it('puts the later date first when a number repeats', () => {
    // A corrected reissue keeps its number; the correction belongs on top.
    const sorted = [issue(9, '2025-06-14'), issue(9, '2025-06-20')].sort(compareBlaettchenIssues)
    expect(sorted.map((i) => i.date)).toStrictEqual(['2025-06-20', '2025-06-14'])
  })
})
