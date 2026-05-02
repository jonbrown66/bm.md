import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('layout loading', () => {
  it('does not statically import the command palette', async () => {
    const layoutPath = fileURLToPath(new URL('./_layout.tsx', import.meta.url))
    const source = await readFile(layoutPath, 'utf8')

    expect(source).not.toMatch(/import\s+\{\s*CommandPalette\s*\}\s+from\s+['"]@\/components\/command-palette['"]/)
    expect(source).toMatch(/lazy\(\(\)\s*=>\s*import\(['"]@\/components\/command-palette['"]\)/)
  })
})
