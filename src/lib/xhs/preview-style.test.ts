import { describe, expect, it } from 'vitest'
import { XHS_LAYOUT_SCALE } from './preview-layout'
import { getXhsArticleCss } from './preview-style'

describe('xhs article spacing', () => {
  it('keeps bottom padding at the normal page margin so images can use remaining space', () => {
    const padding = 28 * XHS_LAYOUT_SCALE
    const css = getXhsArticleCss(12.5, 1.55, 28, 'sans-serif')

    expect(css).toContain(`padding: ${Math.round(padding * 1.28)}px ${padding}px ${padding}px ${padding}px;`)
  })
})
