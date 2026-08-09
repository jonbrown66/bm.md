import { afterEach, describe, expect, it, vi } from 'vitest'
import { setPreviewImageCaptionVisibility, withPreviewImageCaptions } from './preview'

function createPreviewFixture(showImageCaption = false) {
  const content = {} as HTMLElement
  const body = {
    dataset: showImageCaption
      ? { showImageCaption: 'true' }
      : { showImageCaption: 'false' },
  }
  const contentDocument = {
    body,
    getElementById: () => content,
  }
  const iframe = {
    contentDocument,
  } as unknown as HTMLIFrameElement

  return { body, content, iframe }
}

describe('preview image caption visibility', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('updates the iframe visibility flag', () => {
    const { body, iframe } = createPreviewFixture()

    setPreviewImageCaptionVisibility(iframe, true)

    expect(body.dataset.showImageCaption).toBe('true')
  })

  it('restores the preview flag after a visual export callback', async () => {
    const { body, content, iframe } = createPreviewFixture()
    vi.stubGlobal('document', {
      querySelector: () => iframe,
    })

    await withPreviewImageCaptions(async (preview) => {
      expect(preview.content).toBe(content)
      expect(body.dataset.showImageCaption).toBe('true')
    })

    expect(body.dataset.showImageCaption).toBe('false')
  })

  it('restores the preview flag when the callback fails', async () => {
    const { body, iframe } = createPreviewFixture()
    vi.stubGlobal('document', {
      querySelector: () => iframe,
    })

    await expect(withPreviewImageCaptions(async () => {
      throw new Error('export failed')
    })).rejects.toThrow('export failed')

    expect(body.dataset.showImageCaption).toBe('false')
  })
})
