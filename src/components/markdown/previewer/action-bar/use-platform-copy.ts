import type { Platform } from '@/lib/markdown/render/adapters'
import { useCallback, useState } from 'react'
import { mermaidConfig } from '@/config/mermaid'
import { getMarkdownLocaleTexts } from '@/lib/locale'
import { useEditorStore } from '@/stores/editor'
import { useFilesStore } from '@/stores/files'
import { usePreviewStore } from '@/stores/preview'

export interface PlatformCopyResult {
  getHtml: () => Promise<string>
  isLoading: boolean
  error: Error | null
}

// Helper to convert SVG string to PNG Data URI
async function svgToPng(svgString: string, scale = 3): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // Encoding handling for UTF-8 characters in SVG
    const svgData = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`

    img.onload = () => {
      const canvas = document.createElement('canvas')
      // High DPI scaling: use the intrinsic size * scale factor
      canvas.width = img.width * scale
      canvas.height = img.height * scale

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }

      // Ensure white background
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Draw image scaled
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      try {
        const pngUrl = canvas.toDataURL('image/png')
        resolve(pngUrl)
      }
      catch (e) {
        reject(e)
      }
    }

    img.onerror = () => reject(new Error('Failed to load SVG image'))
    img.src = svgData
  })
}

export function usePlatformCopy(platform: Platform): PlatformCopyResult {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const content = useFilesStore(state => state.currentContent)
  const markdownStyle = usePreviewStore(state => state.markdownStyle)
  const codeTheme = usePreviewStore(state => state.codeTheme)
  const enableFootnoteLinks = useEditorStore(state => state.enableFootnoteLinks)
  const openLinksInNewWindow = useEditorStore(state => state.openLinksInNewWindow)
  const setRenderedHtml = usePreviewStore(state => state.setRenderedHtml)

  const getHtml = useCallback(async (): Promise<string> => {
    setIsLoading(true)
    setError(null)

    try {
      const { markdown } = await import('@/lib/markdown/browser')
      const result = await markdown.render({
        markdown: content,
        markdownStyle,
        codeTheme,
        enableFootnoteLinks,
        openLinksInNewWindow,
        platform,
        ...getMarkdownLocaleTexts(),
      })

      let finalHtml = result.result

      // Process Mermaid diagrams
      if (finalHtml.includes('class="mermaid"')) {
        const parser = new DOMParser()
        const doc = parser.parseFromString(finalHtml, 'text/html')
        const nodes = Array.from(doc.querySelectorAll('.mermaid'))

        if (nodes.length > 0) {
          const { default: mermaid } = await import('mermaid')

          // Initialize mermaid
          mermaid.initialize({
            ...mermaidConfig,
            flowchart: {
              ...mermaidConfig.flowchart,
              htmlLabels: false, // SVG only for better rasterization
            },
          })

          await Promise.all(nodes.map(async (node, index) => {
            try {
              const id = `mermaid-copy-${Date.now()}-${index}`
              const text = node.textContent || ''

              // Render SVG
              const renderResult = await mermaid.render(id, text)
              let svg = renderResult.svg

              // Pre-processing SVG for better image conversion
              const parser = new DOMParser()
              const svgDoc = parser.parseFromString(svg, 'image/svg+xml')
              const svgEl = svgDoc.documentElement

              // CRITICAL: Set explicit width/height based on viewBox to ensure
              // the Image object loads it at the correct aspect ratio and size.
              const viewBox = svgEl.getAttribute('viewBox')

              if (viewBox) {
                const [, , vw, vh] = viewBox.split(/\s+|,/).map(Number.parseFloat)
                if (!Number.isNaN(vw) && !Number.isNaN(vh)) {
                  svgEl.setAttribute('width', `${vw}px`)
                  svgEl.setAttribute('height', `${vh}px`)
                }
              }

              // Inject white background rect
              const bgRect = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'rect')
              bgRect.setAttribute('width', '100%')
              bgRect.setAttribute('height', '100%')
              bgRect.setAttribute('fill', '#ffffff')
              if (svgEl.firstChild) {
                svgEl.insertBefore(bgRect, svgEl.firstChild)
              }
              else {
                svgEl.appendChild(bgRect)
              }

              // Force basic text styles
              const allText = svgEl.querySelectorAll('text, tspan')
              allText.forEach((t) => {
                t.setAttribute('fill', '#000000')
                t.setAttribute('font-family', '"Inter", "Segoe UI", sans-serif')
              })

              svg = new XMLSerializer().serializeToString(svgEl)

              // Convert to PNG with High Quality Scale
              // Use scale 3 for Retina/High-DPI sharpness
              const pngDataUrl = await svgToPng(svg, 3)

              // Replace with full-width image
              node.innerHTML = `<img src="${pngDataUrl}" class="mermaid-img" style="width: 100%; height: auto; display: block; margin: 0 auto;" alt="Mermaid Diagram" />`
              node.setAttribute('style', 'text-align: center; margin: 10px 0;')
              node.removeAttribute('data-processed')
            }
            catch (err) {
              console.error('Mermaid image generation error', err)
              node.innerHTML = `<pre class="mermaid-error">${err instanceof Error ? err.message : String(err)}</pre>`
            }
          }))

          finalHtml = doc.body.innerHTML
        }
      }

      setRenderedHtml(platform, finalHtml)
      return finalHtml
    }
    catch (err) {
      const error = err instanceof Error ? err : new Error('渲染失败')
      setError(error)
      console.error(`[${platform}] 渲染失败:`, err)
      throw error
    }
    finally {
      setIsLoading(false)
    }
  }, [content, markdownStyle, codeTheme, enableFootnoteLinks, openLinksInNewWindow, platform, setRenderedHtml]) // Removed getRenderedHtml dependency to force fresh render

  return { getHtml, isLoading, error }
}
