import { describe, expect, test } from 'bun:test'
import { formatNotionId } from './id'

describe('formatNotionId', () => {
  test('formats 32-char hex string into UUID format', () => {
    expect(formatNotionId('310c0fcf90b380b9b75afae81651bead')).toBe(
      '310c0fcf-90b3-80b9-b75a-fae81651bead',
    )
  })

  test('returns already-formatted UUID as-is', () => {
    expect(formatNotionId('310c0fcf-90b3-80b9-b75a-fae81651bead')).toBe(
      '310c0fcf-90b3-80b9-b75a-fae81651bead',
    )
  })

  test('returns non-hex string unchanged', () => {
    expect(formatNotionId('not-a-valid-id')).toBe('not-a-valid-id')
  })

  test('returns wrong-length hex string unchanged', () => {
    expect(formatNotionId('abcdef')).toBe('abcdef')
  })

  test('handles uppercase hex', () => {
    expect(formatNotionId('310C0FCF90B380B9B75AFAE81651BEAD')).toBe(
      '310C0FCF-90B3-80B9-B75A-FAE81651BEAD',
    )
  })

  test('returns empty string unchanged', () => {
    expect(formatNotionId('')).toBe('')
  })
})
