import { describe, expect, it } from 'vitest'
import { parsePdfBackgroundColor } from './pdf-colors'

describe('parsePdfBackgroundColor', () => {
  it('uses white for transparent backgrounds', () => {
    expect(parsePdfBackgroundColor('rgba(0, 0, 0, 0)')).toEqual([255, 255, 255])
    expect(parsePdfBackgroundColor('transparent')).toEqual([255, 255, 255])
  })

  it('converts opaque rgb colors to numeric channels', () => {
    expect(parsePdfBackgroundColor('rgb(12, 34, 56)')).toEqual([12, 34, 56])
    expect(parsePdfBackgroundColor('rgba(12, 34, 56, 0.5)')).toEqual([12, 34, 56])
  })

  it('falls back to white for unsupported colors', () => {
    expect(parsePdfBackgroundColor(undefined)).toEqual([255, 255, 255])
    expect(parsePdfBackgroundColor('var(--page-background)')).toEqual([255, 255, 255])
  })
})
