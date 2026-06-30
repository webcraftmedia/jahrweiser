// @vitest-environment node
import ICAL from 'ical.js'
import { describe, expect, it } from 'vitest'

import {
  displayNameFromVCard,
  readPostalCode,
  readVCardName,
  setPostalCode,
  setVCardName,
  splitDisplayName,
} from './contactName'

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

describe('displayNameFromVCard', () => {
  it('derives "Given Family" from the structured N, ignoring FN order', () => {
    // InfCloud-style reversed FN — N is the reliable source.
    const vcard = parseVCard(['FN:Gebhardt Ulf', 'N:Gebhardt;Ulf;;;'])
    expect(displayNameFromVCard(vcard)).toBe('Ulf Gebhardt')
  })

  it('falls back to FN when there is no N', () => {
    const vcard = parseVCard(['FN:Anna Mustermann'])
    expect(displayNameFromVCard(vcard)).toBe('Anna Mustermann')
  })

  it('returns null when neither N nor FN carry a name', () => {
    const vcard = parseVCard(['EMAIL:x@y.de'])
    expect(displayNameFromVCard(vcard)).toBeNull()
  })
})

describe('readPostalCode', () => {
  it('reads the postal-code component from ADR', () => {
    const vcard = parseVCard(['EMAIL:x@y.de', 'ADR:;;;;;64653;'])
    expect(readPostalCode(vcard)).toBe('64653')
  })

  it('returns an empty string when there is no ADR', () => {
    const vcard = parseVCard(['EMAIL:x@y.de'])
    expect(readPostalCode(vcard)).toBe('')
  })
})

describe('setPostalCode', () => {
  it('adds an ADR with only the postal code when none exists', () => {
    const vcard = parseVCard(['EMAIL:x@y.de'])
    setPostalCode(vcard, '64653')
    expect(readPostalCode(vcard)).toBe('64653')
    // Round-trips and only the postal-code component is set.
    expect(vcard.toString()).toContain('ADR:;;;;;64653;')
  })

  it('updates the postal code on an existing ADR, keeping other parts', () => {
    const vcard = parseVCard(['EMAIL:x@y.de', 'ADR:;;Hauptstr. 1;Bensheim;;64625;DE'])
    setPostalCode(vcard, '64653')
    const comps = vcard.getFirstProperty('adr')?.getValues()[0] as string[]
    expect(comps[2]).toBe('Hauptstr. 1')
    expect(comps[3]).toBe('Bensheim')
    expect(comps[5]).toBe('64653')
    expect(comps[6]).toBe('DE')
  })

  it('clears the postal code when given an empty string', () => {
    const vcard = parseVCard(['EMAIL:x@y.de', 'ADR:;;;;;64653;'])
    setPostalCode(vcard, '')
    expect(readPostalCode(vcard)).toBe('')
  })
})
