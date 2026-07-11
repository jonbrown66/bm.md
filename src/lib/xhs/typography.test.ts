import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getXhsFontOption, getXhsTextFlowCss, XHS_FONT_OPTIONS } from './typography'

describe('xhs typography font options', () => {
  it('uses the same option for the select label and preview font family', () => {
    const serif = getXhsFontOption('serif')

    expect(serif.label).toBe('优雅宋体（衬线）')
    expect(serif.fontFamily).toContain('SimSun')
    expect(XHS_FONT_OPTIONS).toContain(serif)
  })

  it('includes common Chinese font choices as first-class options', () => {
    expect(getXhsFontOption('oppo-sans')).toMatchObject({
      label: 'OPPO Sans',
      value: 'oppo-sans',
    })
    expect(getXhsFontOption('oppo-sans').fontFamily).toContain('OPPO Sans')
    expect(getXhsFontOption('misans-light')).toBe(getXhsFontOption('oppo-sans'))
    expect(XHS_FONT_OPTIONS.some(option => option.value === 'misans-light')).toBe(false)

    expect(getXhsFontOption('source-han-serif')).toMatchObject({
      label: '思源宋体',
      value: 'source-han-serif',
    })
    expect(getXhsFontOption('source-han-serif').fontFamily).toContain('Source Han Serif SC')

    expect(getXhsFontOption('source-han-sans')).toMatchObject({
      label: '思源黑体',
      value: 'source-han-sans',
    })
    expect(getXhsFontOption('source-han-sans').fontFamily).toContain('Source Han Sans SC')
  })

  it('keeps heavy XHS webfonts out of the global app stylesheet', () => {
    const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

    expect(styles).not.toContain('/fonts/oppo-sans/font.css')
    expect(styles).not.toContain('/fonts/source-han-sans-sc-vf/font.css')
    expect(styles).not.toContain('/fonts/source-han-serif-sc-vf/font.css')
  })

  it('declares bundled webfont CSS only on font options that need it', () => {
    expect(getXhsFontOption('sans-serif').fontCssHref).toBeUndefined()
    expect(getXhsFontOption('oppo-sans').fontCssHref).toBe('/fonts/oppo-sans/font.css')
    expect(getXhsFontOption('source-han-sans').fontCssHref).toBe('/fonts/source-han-sans-sc-vf/font.css')
    expect(getXhsFontOption('source-han-serif').fontCssHref).toBe('/fonts/source-han-serif-sc-vf/font.css')
  })

  it('uses OPPO Sans as a woff2 webfont instead of the original ttf payload', () => {
    const oppoSansCss = readFileSync(resolve(process.cwd(), 'public/fonts/oppo-sans/font.css'), 'utf8')

    expect(oppoSansCss).toContain('font-family: \'OPPO Sans\'')
    expect(oppoSansCss).toContain('/fonts/oppo-sans/OPPO-Sans-4.0.woff2')
    expect(oppoSansCss).toContain('format(\'woff2\')')
    expect(oppoSansCss).not.toContain('OPPO-Sans-4.0.ttf')
  })

  it('falls back to the default sans-serif option for unknown persisted values', () => {
    expect(getXhsFontOption('unknown')).toBe(getXhsFontOption('sans-serif'))
  })

  it('keeps Chinese body text naturally spaced', () => {
    const css = getXhsTextFlowCss()

    expect(css).toContain('letter-spacing: normal;')
    expect(css).toContain('text-align: left !important;')
    expect(css).not.toContain('text-align: justify')
  })
})
