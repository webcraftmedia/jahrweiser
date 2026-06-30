// @vitest-environment node
import ICAL from 'ical.js'
import { describe, expect, it } from 'vitest'

import { readVCardName, setVCardName, splitDisplayName } from './contactName'

function parseVCard(lines: string[]): ICAL.Component {
  return new ICAL.Component(
    ICAL.parse(['BEGIN:VCARD', 'VERSION:4.0', ...lines, 'END:VCARD'].join('\r\n')),
  )
}

describe('splitDisplayName', () => {
  it('returns empty parts for a blank name', () => {
    expect(splitDisplayName('   ')).toStrictEqual({ firstName: '', lastName: '' })
  })

  it('treats a single word as the first name', () => {
    expect(splitDisplayName('Anna')).toStrictEqual({ firstName: 'Anna', lastName: '' })
  })

  it('splits on the first space, keeping the rest as the last name', () => {
    expect(splitDisplayName('Anna von Berg')).toStrictEqual({
      firstName: 'Anna',
      lastName: 'von Berg',
    })
  })
})

describe('readVCardName', () => {
  it('reads the structured N (family;given)', () => {
    const vcard = parseVCard(['FN:Anna Mustermann', 'N:Mustermann;Anna;;;'])
    expect(readVCardName(vcard)).toStrictEqual({ firstName: 'Anna', lastName: 'Mustermann' })
  })

  it('falls back to splitting FN when N is absent', () => {
    const vcard = parseVCard(['FN:Anna Mustermann'])
    expect(readVCardName(vcard)).toStrictEqual({ firstName: 'Anna', lastName: 'Mustermann' })
  })

  it('falls back to FN when N is present but empty', () => {
    const vcard = parseVCard(['FN:Solo', 'N:;;;;'])
    expect(readVCardName(vcard)).toStrictEqual({ firstName: 'Solo', lastName: '' })
  })

  it('returns empty parts when neither N nor FN carry a name', () => {
    const vcard = parseVCard(['EMAIL:x@y.de'])
    expect(readVCardName(vcard)).toStrictEqual({ firstName: '', lastName: '' })
  })
})

describe('setVCardName', () => {
  it('adds FN and N when none exist', () => {
    const vcard = parseVCard(['EMAIL:x@y.de'])
    setVCardName(vcard, 'Anna', 'Mustermann')
    expect(vcard.getFirstPropertyValue('fn')).toBe('Anna Mustermann')
    expect(vcard.getFirstProperty('n')?.getValues()).toStrictEqual([
      ['Mustermann', 'Anna', '', '', ''],
    ])
  })

  it('overwrites an existing FN and N', () => {
    const vcard = parseVCard(['FN:Old Name', 'N:Name;Old;;;', 'EMAIL:x@y.de'])
    setVCardName(vcard, 'New', 'Person')
    expect(vcard.getFirstPropertyValue('fn')).toBe('New Person')
    expect(vcard.getFirstProperty('n')?.getValues()).toStrictEqual([['Person', 'New', '', '', '']])
    // Round-trips cleanly through serialization.
    const reparsed = new ICAL.Component(ICAL.parse(vcard.toString()))
    expect(reparsed.getFirstPropertyValue('fn')).toBe('New Person')
  })

  it('trims a trailing space when the last name is empty', () => {
    const vcard = parseVCard(['EMAIL:x@y.de'])
    setVCardName(vcard, 'Solo', '')
    expect(vcard.getFirstPropertyValue('fn')).toBe('Solo')
  })
})
