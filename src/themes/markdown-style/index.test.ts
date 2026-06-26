import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderDefinition } from '@/lib/markdown/render'
import { normalizePreviewMarkdownStyle, usePreviewStore } from '@/stores/preview'
import { loadMarkdownStyleCss, markdownStyles } from './index'

describe('markdown styles', () => {
  function getRootContainerRule(source: string): string {
    return source.match(/#bm-md\s*\{[^}]*\}/)?.[0] ?? ''
  }

  function getRule(source: string, selector: string): string {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return source.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`))?.[0] ?? ''
  }

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

  it('keeps built-in theme containers transparent', async () => {
    for (const style of markdownStyles) {
      const cssPath = fileURLToPath(new URL(`./${style.id}.css`, import.meta.url))
      const source = await readFile(cssPath, 'utf8')

      expect(getRootContainerRule(source)).toContain('background-color: transparent')
    }
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
    expect(source).toMatch(/#bm-md\s*\{[\s\S]*?border: none;/)
    expect(source).toMatch(/#bm-md h1,\s*#bm-md h2\s*\{[\s\S]*?border-bottom: none;/)
    expect(source).toContain('background-color: #f4f4f3')
    expect(source).toContain('background-image:')
    expect(source).toContain('radial-gradient(circle, #5ac85a 0 0.3em, transparent 0.31em)')
    expect(source).toMatch(/#bm-md pre\s*\{[\s\S]*?padding: 2\.15em 0\.9em 0\.9em;/)
    expect(source).toMatch(/#bm-md pre\s*\{[\s\S]*?overflow-x: auto;/)
    expect(source).toMatch(/#bm-md pre\s*\{[\s\S]*?-webkit-overflow-scrolling: touch;/)
    expect(source).toContain('#bm-md pre::-webkit-scrollbar')
    expect(source).toMatch(/#bm-md pre::before\s*\{[\s\S]*?content: none;/)
    expect(source).toMatch(/#bm-md pre::after\s*\{[\s\S]*?content: none;/)
    expect(source).toMatch(/#bm-md pre::-webkit-scrollbar\s*\{[\s\S]*?height: 4px;/)
    expect(source).toMatch(/#bm-md pre::-webkit-scrollbar-button\s*\{[\s\S]*?display: none;/)
    expect(source).toMatch(/#bm-md pre::-webkit-scrollbar-track\s*\{[\s\S]*?background-color: transparent;/)
    expect(source).toMatch(/#bm-md pre::-webkit-scrollbar-thumb\s*\{[\s\S]*?background-color: #c7c7c7 !important;/)
    expect(source).toMatch(/@media \(hover: none\)\s*\{[\s\S]*?#bm-md pre::after\s*\{[\s\S]*?background-color: #d0d0d0;/)
    expect(source).toMatch(/#bm-md pre code\s*\{[\s\S]*?min-width: max-content;/)
    expect(source).toMatch(/#bm-md pre code\s*\{[\s\S]*?white-space: pre;/)
    expect(source).toMatch(/#bm-md pre code \*\s*\{[\s\S]*?white-space: pre;/)
    expect(source).toContain('#bm-md .figure-table')
    expect(source).toContain('scrollbar-gutter: stable')
    expect(source).toContain('overflow-wrap: anywhere')
    expect(source).not.toContain('#bm-md .code-block-copy')
  })

  it('uses compact mac-style code blocks in professional theme', async () => {
    const cssPath = fileURLToPath(new URL('./professional.css', import.meta.url))
    const source = await readFile(cssPath, 'utf8')

    expect(source).toMatch(/#bm-md pre\s*\{[\s\S]*?padding: 2\.15em 0\.9em 0\.9em;/)
    expect(source).toContain('radial-gradient(circle, #5ac85a 0 0.3em, transparent 0.31em)')
    expect(source).toMatch(/#bm-md pre\s*\{[\s\S]*?overflow-x: auto;/)
    expect(source).toMatch(/#bm-md pre\s*\{[\s\S]*?-webkit-overflow-scrolling: touch;/)
    expect(source).toContain('#bm-md pre::-webkit-scrollbar')
    expect(source).toMatch(/#bm-md pre::before\s*\{[\s\S]*?content: none;/)
    expect(source).toMatch(/#bm-md pre::after\s*\{[\s\S]*?content: none;/)
    expect(source).toMatch(/#bm-md pre::-webkit-scrollbar\s*\{[\s\S]*?height: 4px;/)
    expect(source).toMatch(/#bm-md pre::-webkit-scrollbar-button\s*\{[\s\S]*?display: none;/)
    expect(source).toMatch(/#bm-md pre::-webkit-scrollbar-track\s*\{[\s\S]*?background-color: transparent;/)
    expect(source).toMatch(/#bm-md pre::-webkit-scrollbar-thumb\s*\{[\s\S]*?background-color: #c7c7c7 !important;/)
    expect(source).toMatch(/@media \(hover: none\)\s*\{[\s\S]*?#bm-md pre::after\s*\{[\s\S]*?background-color: #d0d0d0;/)
    expect(source).toMatch(/#bm-md pre code\s*\{[\s\S]*?min-width: max-content;/)
    expect(source).toMatch(/#bm-md pre code\s*\{[\s\S]*?white-space: pre;/)
    expect(source).toMatch(/#bm-md pre code \*\s*\{[\s\S]*?white-space: pre;/)
  })

  it('uses the configured professional subsection heading color', async () => {
    const cssPath = fileURLToPath(new URL('./professional.css', import.meta.url))
    const source = await readFile(cssPath, 'utf8')

    expect(getRule(source, '#bm-md h2')).toContain('color: #b8860b')
  })
})
