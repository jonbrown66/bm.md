import { describe, expect, it } from 'vitest'
import { applyProjectNameToCoverDocument, clampCoverElement, createDefaultCoverDocument, parseCoverDocument } from './cover-document'

describe('xhs cover document', () => {
  it('creates the fixed branded cover without reading the article title', () => {
    const result = createDefaultCoverDocument('# Memdex\n\n每天拆解一个 AI 产品')

    expect(result.elements.map(element => element.type)).toEqual(['text', 'image', 'text'])
    expect(result.elements[0]).toMatchObject({
      type: 'text',
      text: '项目名',
      fontSize: 120,
      highlightColor: 'transparent',
      textStrokeColor: '#ffffff',
      textStrokeWidth: 0,
      textShadowColor: '#2e85ff',
      textShadowOffsetX: 5,
      textShadowOffsetY: 5,
      textShadowBlur: 0,
    })
    expect(result.elements[1]).toMatchObject({ type: 'image', alt: '品牌标志' })
    expect(result.elements[2]).toMatchObject({
      type: 'text',
      text: '每天拆解一个AI项目  ⇢',
      fontSize: 35,
      backgroundColor: '#2854e8',
      borderRadius: 38,
    })
  })

  it('keeps the project name placeholder for any markdown content', () => {
    expect(createDefaultCoverDocument('## 次级标题').elements[0]).toMatchObject({ text: '项目名' })
    expect(createDefaultCoverDocument('普通正文').elements[0]).toMatchObject({ text: '项目名' })
  })

  it('only replaces the project name when reusing a cover template', () => {
    const template = createDefaultCoverDocument('# Memdex\n\n每天拆解一个 AI 产品')
    const result = applyProjectNameToCoverDocument(template, '# OpenAI Codex\n\n这段正文不应进入封面')

    expect(result.elements[0]).toMatchObject({ type: 'text', text: 'OpenAI Codex' })
    expect(result.elements.slice(1)).toEqual(template.elements.slice(1))
  })

  it('rejects unknown document versions', () => {
    expect(parseCoverDocument({ version: 2, width: 720, height: 960, elements: [] })).toBeNull()
  })

  it('adds defaults when loading a cover saved before text effects existed', () => {
    const result = parseCoverDocument({
      version: 1,
      width: 720,
      height: 960,
      elements: [{
        id: 'text-legacy',
        type: 'text',
        x: 0,
        y: 0,
        width: 240,
        height: 80,
        zIndex: 1,
        text: 'Legacy',
        fontFamily: 'sans-serif',
        fontSize: 32,
        fontWeight: 400,
        color: '#111111',
        textAlign: 'left',
        verticalAlign: 'top',
        lineHeight: 1.2,
        backgroundColor: 'transparent',
        borderColor: '#111111',
        borderWidth: 0,
        borderRadius: 0,
      }],
    })

    expect(result?.elements[0]).toMatchObject({
      highlightColor: 'transparent',
      textStrokeColor: '#ffffff',
      textStrokeWidth: 0,
      textShadowColor: '#2e85ff',
      textShadowOffsetX: 5,
      textShadowOffsetY: 5,
      textShadowBlur: 0,
    })
  })

  it('keeps elements inside the canvas', () => {
    const result = clampCoverElement({
      id: 'text-1',
      type: 'text',
      x: 700,
      y: 950,
      width: 200,
      height: 100,
      zIndex: 1,
      text: 'A',
      fontFamily: 'OPPO Sans',
      fontSize: 48,
      fontWeight: 700,
      color: '#000000',
      highlightColor: 'transparent',
      textStrokeColor: '#ffffff',
      textStrokeWidth: 0,
      textShadowColor: '#2e85ff',
      textShadowOffsetX: 5,
      textShadowOffsetY: 5,
      textShadowBlur: 0,
      textAlign: 'left',
      verticalAlign: 'top',
      lineHeight: 1.2,
      backgroundColor: 'transparent',
      borderColor: '#000000',
      borderWidth: 0,
      borderRadius: 0,
    })

    expect(result.x).toBe(520)
    expect(result.y).toBe(860)
  })

  it('preserves image aspect ratio while clamping its size', () => {
    const result = clampCoverElement({
      id: 'image-1',
      type: 'image',
      x: 0,
      y: 0,
      width: 900,
      height: 450,
      zIndex: 1,
      src: 'data:image/png;base64,abc',
      aspectRatio: 2,
      alt: '',
    })

    expect(result.width).toBe(720)
    expect(result.height).toBe(360)
  })
})
