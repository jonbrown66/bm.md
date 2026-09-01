import { describe, expect, it } from 'vitest'
import { renderDefinition } from './index'

describe('markdown render definition', () => {
  it('preserves the image caption option in parsed input', () => {
    const input = renderDefinition.inputSchema.parse({
      markdown: '![示例图片](https://example.com/image.png)',
      showImageCaption: false,
    })

    expect(input.showImageCaption).toBe(false)
  })
})
