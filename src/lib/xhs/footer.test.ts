import { describe, expect, it } from 'vitest'
import { formatXhsPageFooter } from './footer'

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
})
