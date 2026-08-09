import { mermaidConfig } from '@/config/mermaid'
import { padMermaidViewBox } from '@/lib/xhs/mermaid-style'
import { usePreviewStore } from '@/stores/preview'

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null

async function loadMermaid() {
  mermaidPromise ??= import('mermaid').then((mod) => {
    mod.default.initialize(mermaidConfig)
    return mod.default
  })

  return mermaidPromise
}

// 将 SVG 字符串通过 Canvas 栅格化为高清 PNG data URL
async function svgToPng(svgString: string, scale = 3): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const svgData = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      try {
        resolve(canvas.toDataURL('image/png'))
      }
      catch (e) {
        reject(e)
      }
    }

    img.onerror = () => reject(new Error('Failed to load SVG image'))
    img.src = svgData
  })
}

export async function renderMermaidNodes(container: HTMLElement) {
  const nodes = Array.from(
    container.querySelectorAll('.mermaid:not([data-processed="true"])'),
  ) as HTMLElement[]

  if (nodes.length === 0) {
    return
  }

  const mermaid = await loadMermaid()

  const state = usePreviewStore.getState()
  const baseFontSize = state.xhsFontSize || 14
  const xhsLayoutScale = 720 / 375
  const targetFontSize = Math.round(baseFontSize * xhsLayoutScale * 1.45)

  mermaid.initialize({
    ...mermaidConfig,
    themeVariables: {
      ...mermaidConfig.themeVariables,
      fontSize: `${Math.max(targetFontSize, 24)}px`,
    },
    flowchart: {
      ...mermaidConfig.flowchart,
      nodeSpacing: Math.round(26 * xhsLayoutScale),
      rankSpacing: Math.round(18 * xhsLayoutScale),
      padding: Math.round(10 * xhsLayoutScale),
    },
  })

  await Promise.all(nodes.map(async (node, index) => {
    try {
      const id = `xhs-mermaid-${Date.now()}-${index}`
      const rawText = node.textContent || ''

      // 剥离内联 %%{init: ... }%% 块，让底层配置生效
      const text = rawText.replace(/%%\{init:[\s\S]*?\}%%/gi, '')

      const { svg: rawSvg } = await mermaid.render(id, text)

      // 预处理 SVG：补全尺寸属性、注入白底
      const parser = new DOMParser()
      const svgDoc = parser.parseFromString(rawSvg, 'image/svg+xml')
      const svgEl = svgDoc.documentElement

      const viewBox = svgEl.getAttribute('viewBox')
      if (viewBox) {
        const parts = viewBox.split(/\s+|,/).map(Number.parseFloat)
        const [vx, vy, vw, vh] = parts
        if ([vx, vy, vw, vh].every(value => value !== undefined && !Number.isNaN(value))) {
          const padded = padMermaidViewBox({
            x: vx ?? 0,
            y: vy ?? 0,
            width: vw ?? 0,
            height: vh ?? 0,
          })
          svgEl.setAttribute('viewBox', `${padded.x} ${padded.y} ${padded.width} ${padded.height}`)
          svgEl.setAttribute('width', `${padded.width}px`)
          svgEl.setAttribute('height', `${padded.height}px`)
          svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet')
        }
      }

      // 白底 rect 防止透明背景在 Canvas 中变黑
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

      // 将 beautiful-mermaid 风格的美化样式直接注入 SVG 内部，
      // 因为 Canvas 栅格化时外部 CSS 不生效，必须内嵌。
      // 颜色基于 Two-Color Foundation 预计算：fg=#0f172a, bg=#fffffe
      const styleEl = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'style')
      styleEl.textContent = `
        /* 节点形状 */
        .node rect, .node circle, .node polygon, .node path {
          fill: #e8eef8 !important;
          stroke: #bcc9d8 !important;
          stroke-width: 1.75px !important;
          rx: 12px;
          ry: 12px;
        }
        .nodes > .node:nth-child(4n + 2) rect,
        .nodes > .node:nth-child(4n + 2) circle,
        .nodes > .node:nth-child(4n + 2) polygon,
        .nodes > .node:nth-child(4n + 2) path {
          fill: #e7f1eb !important;
          stroke: #b9d2c2 !important;
        }
        .nodes > .node:nth-child(4n + 3) rect,
        .nodes > .node:nth-child(4n + 3) circle,
        .nodes > .node:nth-child(4n + 3) polygon,
        .nodes > .node:nth-child(4n + 3) path {
          fill: #f5ecdf !important;
          stroke: #ddc7aa !important;
        }
        .nodes > .node:nth-child(4n) rect,
        .nodes > .node:nth-child(4n) circle,
        .nodes > .node:nth-child(4n) polygon,
        .nodes > .node:nth-child(4n) path {
          fill: #eee9f5 !important;
          stroke: #cfc1df !important;
        }
        /* 连线 */
        .edgePath .path {
          stroke: #8290a3 !important;
          stroke-width: 1.75px !important;
        }
        /* 箭头 */
        marker path {
          fill: #66758a !important;
          stroke: none !important;
        }
        /* 子图 */
        .cluster rect {
          fill: #f7f8fa !important;
          stroke: #d8dde5 !important;
          stroke-width: 1px !important;
          rx: 10px;
          ry: 10px;
        }
        .cluster .nodeLabel {
          font-weight: 600 !important;
          color: #6f7380 !important;
        }
        /* 节点文本 */
        .nodeLabel {
          font-family: Inter, "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif !important;
          font-size: ${Math.max(targetFontSize, 24)}px !important;
          line-height: 1.35 !important;
          font-weight: 600 !important;
          color: #273444 !important;
        }
        /* 连线标签 */
        .edgeLabel {
          font-family: Inter, "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif !important;
          font-size: ${Math.max(targetFontSize - 5, 18)}px !important;
          font-weight: 500 !important;
          color: #66758a !important;
        }
        .edgeLabel rect {
          fill: #ffffff !important;
          rx: 4px;
          ry: 4px;
        }
        /* SVG text 元素兜底 */
        text, tspan {
          font-family: Inter, "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif !important;
        }
      `
      // 插入到白底 rect 之后（确保 style 位于 SVG 前部生效）
      if (bgRect.nextSibling) {
        svgEl.insertBefore(styleEl, bgRect.nextSibling)
      }
      else {
        svgEl.appendChild(styleEl)
      }

      const processedSvg = new XMLSerializer().serializeToString(svgEl)

      // 3x Retina 栅格化为 PNG，字号被"烧录"进位图，不再受容器缩放影响
      const pngDataUrl = await svgToPng(processedSvg, 3)

      // 用 <img> 替换 SVG，html2canvas 可完美识别
      node.innerHTML = `<img src="${pngDataUrl}" style="width: 100%; height: auto; display: block;" alt="Mermaid Diagram" />`
      node.setAttribute('data-processed', 'true')
    }
    catch (error) {
      console.error('Mermaid render error:', error)
      node.innerHTML = `<p class="text-red-500 font-mono text-sm p-2 bg-red-50 rounded">${error instanceof Error ? error.message : String(error)}</p>`
    }
  }))
}

export function cleanInlineStyles(html: string) {
  return html
    .replace(/font-family\s*:[^;"]+;?/gi, '')
    .replace(/font-size\s*:[^;"]+;?/gi, '')
    .replace(/line-height\s*:[^;"]+;?/gi, '')
}

export async function waitForImages(container: HTMLElement) {
  const images = Array.from(container.querySelectorAll('img'))
  await Promise.all(images.map(image => new Promise<void>((resolve) => {
    if (image.complete) {
      resolve()
      return
    }

    image.addEventListener('load', () => resolve(), { once: true })
    image.addEventListener('error', () => resolve(), { once: true })
  })))
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsDataURL(blob)
  })
}

const inlineImageCache = new Map<string, string>()
const MAX_INLINE_IMAGE_CACHE_SIZE = 64

function cacheInlineImage(url: string, dataUrl: string) {
  if (inlineImageCache.size >= MAX_INLINE_IMAGE_CACHE_SIZE) {
    const oldestKey = inlineImageCache.keys().next().value
    if (oldestKey) {
      inlineImageCache.delete(oldestKey)
    }
  }
  inlineImageCache.set(url, dataUrl)
}

export async function inlineRemoteImages(container: HTMLElement, signal: AbortSignal) {
  const images = Array.from(container.querySelectorAll('img'))

  await Promise.all(images.map(async (image) => {
    if (signal.aborted) {
      return
    }

    const source = image.currentSrc || image.src
    if (!source || source.startsWith('data:') || source.startsWith('blob:')) {
      return
    }

    let url: URL
    try {
      url = new URL(source, window.location.href)
    }
    catch {
      return
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      return
    }

    try {
      const cached = inlineImageCache.get(url.href)
      if (cached) {
        image.src = cached
        image.removeAttribute('srcset')
        image.removeAttribute('sizes')
        return
      }

      const response = await fetch(url.href, { signal })
      if (!response.ok) {
        return
      }

      const dataUrl = await blobToDataUrl(await response.blob())
      if (signal.aborted) {
        return
      }

      cacheInlineImage(url.href, dataUrl)
      image.src = dataUrl
      image.removeAttribute('srcset')
      image.removeAttribute('sizes')
    }
    catch (error) {
      if (signal.aborted) {
        return
      }
      console.warn('Inline XHS image failed:', source, error)
    }
  }))
}
