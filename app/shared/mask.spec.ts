import { describe, expect, it } from 'vitest'

import { abbreviateName, maskEmail } from './mask'

describe('abbreviateName', () => {
  it.each([
    ['Anna Mustermann', 'Anna M.'],
    // The surname is the last part, so the middle name does not become the
    // initial.
    ['Anna Maria Mustermann', 'Anna Maria M.'],
    ['Anna Müller-Lüdenscheidt', 'Anna M.'],
    ['  Anna   Mustermann  ', 'Anna M.'],
    // A single name stays whole — "A." would name nobody.
    ['Anna', 'Anna'],
    ['Éva Ördög', 'Éva Ö.'],
  ])('shortens %s to %s', (input, expected) => {
    expect(abbreviateName(input)).toBe(expected)
  })

  it.each([[null], [undefined], [''], ['   ']])('has nothing to shorten for %s', (input) => {
    expect(abbreviateName(input)).toBe('')
  })

  it('keeps an initial that is outside the basic plane whole', () => {
    // `surname[0]` would return half a surrogate pair and render as a box.
    expect(abbreviateName('Anna 𝒜nders')).toBe('Anna 𝒜.')
  })
})

describe('maskEmail', () => {
  it.each([
    ['anna.mustermann@example.de', 'an•••@ex•••.de'],
    ['m.weber@gmx.de', 'm.•••@gm•••.de'],
    ['vorstand@gg-und-g.de', 'vo•••@gg•••.de'],
    // Short parts give what they have rather than padding to two.
    ['a@b.de', 'a•••@b•••.de'],
    ['ANNA@EXAMPLE.DE', 'AN•••@EX•••.DE'],
    ['  anna@example.de  ', 'an•••@ex•••.de'],
    // Only the last dot separates the suffix, so a second level stays hidden.
    ['anna@mail.example.co.uk', 'an•••@ma•••.uk'],
    // A plus tag must not survive: it is part of the address.
    ['anna+jahrweiser@example.de', 'an•••@ex•••.de'],
  ])('masks %s as %s', (input, expected) => {
    expect(maskEmail(input)).toBe(expected)
  })

  it('leaves no visible suffix on a domain that has none', () => {
    expect(maskEmail('anna@intranet')).toBe('an•••@in•••')
  })

  it.each([
    [null],
    [undefined],
    [''],
    ['not-an-address'],
    // No local part, and no domain — both would otherwise expose the half that
    // does exist.
    ['@example.de'],
    ['anna@'],
  ])('masks %s completely rather than guessing at its shape', (input) => {
    expect(maskEmail(input)).toBe('•••')
  })

  it('never contains the original local part', () => {
    // The property that matters: whatever the shape, the address must not be
    // reconstructable from the row.
    const masked = maskEmail('geschaeftsstelle@gg-und-g.de')
    expect(masked).not.toContain('geschaeftsstelle')
    expect(masked).not.toContain('gg-und-g')
  })
})
