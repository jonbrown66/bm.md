import { describe, expect, it } from 'vitest'
import { formatXhsContentPageFooter, formatXhsPageFooter } from './footer'

describe('xhs page footer', () => {
  it('formats ordered page footer with at least two digits', () => {
    expect(formatXhsPageFooter(1, 5)).toBe('01 / 05')
    expect(formatXhsPageFooter(5, 5)).toBe('05 / 05')
  })

  it('expands digit width for large page counts', () => {
    expect(formatXhsPageFooter(1, 120)).toBe('001 / 120')
  })

  it('keeps page number within the available page range', () => {
    expect(formatXhsPageFooter(0, 5)).toBe('01 / 05')
    expect(formatXhsPageFooter(9, 5)).toBe('05 / 05')
  })

  it('starts content page footers at 01 after the cover', () => {
    expect(formatXhsContentPageFooter(0, 3)).toBe('01 / 03')
    expect(formatXhsContentPageFooter(2, 3)).toBe('03 / 03')
  })
})
