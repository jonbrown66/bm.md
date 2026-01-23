import type { Plugin } from 'vite'
import { Buffer } from 'node:buffer'
import { transform } from 'lightningcss'

export function cssRawMinifyPlugin(): Plugin {
  return {
    name: 'css-raw-minify',
    enforce: 'pre',
    async transform(code, id) {
      if (!id.endsWith('.css?raw'))
        return

      const exportDefaultMatch = code.match(/^export default ("[\s\S]*")/m)
      if (!exportDefaultMatch)
        return

      try {
        const css = JSON.parse(exportDefaultMatch[1])

        const { code: minified } = transform({
          filename: id.replace('?raw', ''),
          code: Buffer.from(css),
          minify: true,
        })

        return {
          code: `export default ${JSON.stringify(minified.toString())}`,
          map: null,
        }
      }
      catch (e) {
        console.error(`[css-raw-minify] Failed to minify ${id}:`, e)
      }
    },
  }
}
