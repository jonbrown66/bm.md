import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('preview mermaid loading', () => {
  it('does not statically import mermaid in preview and copy paths', async () => {
    const previewPath = fileURLToPath(new URL('./render.tsx', import.meta.url))
    const copyPath = fileURLToPath(new URL('./action-bar/use-platform-copy.ts', import.meta.url))

    const [previewSource, copySource] = await Promise.all([
      readFile(previewPath, 'utf8'),
      readFile(copyPath, 'utf8'),
    ])

    expect(previewSource).not.toMatch(/import\s+mermaid\s+from\s+['"]mermaid['"]/)
    expect(copySource).not.toMatch(/import\s+mermaid\s+from\s+['"]mermaid['"]/)
  })

  it('passes custom css through the platform copy render path', async () => {
    const copyPath = fileURLToPath(new URL('./action-bar/use-platform-copy.ts', import.meta.url))
    const copySource = await readFile(copyPath, 'utf8')

    expect(copySource).toContain('const customCss = usePreviewStore')
    expect(copySource).toContain('customCss,')
    expect(copySource).toContain('customCss, enableFootnoteLinks')
  })
})
