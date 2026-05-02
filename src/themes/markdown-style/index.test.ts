import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderDefinition } from '@/lib/markdown/render'
import { normalizePreviewMarkdownStyle, usePreviewStore } from '@/stores/preview'
import { loadMarkdownStyleCss, markdownStyles } from './index'

describe('markdown styles', () => {
  it('only exposes the essential built-in themes', async () => {
    expect(markdownStyles.map(style => style.id)).toEqual([
      'botanical',
      'kiko',
      'professional',
    ])

    const loaderPath = fileURLToPath(new URL('./loader.ts', import.meta.url))
    const loaderSource = await readFile(loaderPath, 'utf8')

    expect(loaderSource).toContain('botanical:')
    expect(loaderSource).toContain('kiko:')
    expect(loaderSource).toContain('professional:')
    expect(loaderSource).not.toContain('\'ayu-light\'')
    expect(loaderSource).not.toContain('\'maximalism\'')
    expect(await loadMarkdownStyleCss('ayu-light')).toBeUndefined()
  })

  it('uses a remaining theme as the default markdown style', () => {
    const styleIds = markdownStyles.map(style => style.id)
    const apiDefault = renderDefinition.inputSchema.parse({ markdown: '' }).markdownStyle
    const storeDefault = usePreviewStore.getState().markdownStyle

    expect(styleIds).toContain(apiDefault)
    expect(styleIds).toContain(storeDefault)
  })

  it('normalizes removed persisted markdown styles to a remaining theme', () => {
    expect(normalizePreviewMarkdownStyle('ayu-light')).toBe('professional')
    expect(normalizePreviewMarkdownStyle('botanical')).toBe('botanical')
  })

  it('registers and loads kiko theme css', async () => {
    expect(markdownStyles).toContainEqual({ id: 'kiko', name: 'Kiko' })

    const css = await loadMarkdownStyleCss('kiko')
    const cssPath = fileURLToPath(new URL('./kiko.css', import.meta.url))
    const loaderPath = fileURLToPath(new URL('./loader.ts', import.meta.url))
    const source = await readFile(cssPath, 'utf8')
    const loaderSource = await readFile(loaderPath, 'utf8')

    expect(css).not.toBeUndefined()
    expect(loaderSource).toContain('kiko: async () =>')
    expect(loaderSource).toContain('import(\'./blueprint.css?raw\')')
    expect(source).toContain('Kiko')
    expect(source).toContain('background-color: transparent')
    expect(source).toContain('background-color: #f4f4f3')
    expect(source).toContain('background-image:')
    expect(source).toContain('radial-gradient(circle, #5ac85a 0 0.42em, transparent 0.43em)')
    expect(source).toContain('#bm-md .figure-table')
    expect(source).toContain('scrollbar-gutter: stable')
    expect(source).toContain('overflow-wrap: anywhere')
    expect(source).not.toContain('#bm-md .code-block-copy')
  })
})
