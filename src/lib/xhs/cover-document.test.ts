import { describe, expect, it } from 'vitest'
import { clampCoverElement, createDefaultCoverDocument, parseCoverDocument } from './cover-document'

describe('xhs cover document', () => {
  it('creates editable title and subtitle layers from markdown', () => {
    const result = createDefaultCoverDocument('# Memdex\n\n每天拆解一个 AI 产品')

    expect(result.elements.map(element => element.type)).toEqual(['text', 'text'])
    expect(result.elements[0]).toMatchObject({ type: 'text', text: 'Memdex' })
    expect(result.elements[1]).toMatchObject({ type: 'text', text: '每天拆解一个 AI 产品' })
  })

  it('falls back to an h2 and a safe untitled label', () => {
    expect(createDefaultCoverDocument('## 次级标题').elements[0]).toMatchObject({ text: '次级标题' })
    expect(createDefaultCoverDocument('普通正文').elements[0]).toMatchObject({ text: '未命名文章' })
  })

  it('rejects unknown document versions', () => {
    expect(parseCoverDocument({ version: 2, width: 720, height: 960, elements: [] })).toBeNull()
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
