import type { CaptureContext, SnapdomPlugin } from '@zumer/snapdom'
import type { PreviewIframe } from './preview'
import { toast } from 'sonner'
import { inlineImages } from './inline-images'
import { parsePdfBackgroundColor } from './pdf-colors'
import { getPreviewIframe, setPreviewImageCaptionVisibility, withPreviewImageCaptions } from './preview'

let isExporting = false

const BLOCK_SELECTORS = 'p, li, blockquote, pre, img, figure, table, tr, td, th, dl, details, figcaption, .markdown-alert, .math-display'
const HEADING_SELECTORS = 'h1, h2, h3, h4, h5, h6'
const PDF_CAPTURE_SCALE = 4
const PDF_CAPTURE_MAX_PIXELS = 32_000_000
const PDF_IMAGE_QUALITY = 0.9
const PDF_RASTER_ANALYSIS_MAX_WIDTH = 320
const PAGE_BREAK_SAFETY_CSS_PX = 6
const MIN_PAGE_PROGRESS_PX = 1
const RASTER_BREAK_SEARCH_CSS_PX = 96
const RASTER_BREAK_CLEARANCE_CSS_PX = 6
const RASTER_CONTENT_CONTRAST = 36
const RASTER_BUSY_ROW_RATIO = 0.012

interface ElementBoundary {
  top: number
  bottom: number
  isHeading: boolean
}

interface CaptureLayout {
  width: number
  height: number
  boundaries: ElementBoundary[]
}

function createCaptureLayoutPlugin(
  onLayout: (layout: CaptureLayout) => void,
): SnapdomPlugin {
  return {
    name: 'bm-pdf-capture-layout',
    async beforeRender(context: CaptureContext) {
      const clone = context.clone
      if (!(clone instanceof HTMLElement))
        return

      const sourceWidth = context.element.getBoundingClientRect().width
      const holder = document.createElement('div')
      holder.style.cssText = [
        'position: absolute',
        'left: -100000px',
        'top: 0',
        `width: ${Math.max(1, Math.ceil(sourceWidth))}px`,
        'visibility: hidden',
        'pointer-events: none',
        'overflow: visible',
      ].join(';')

      document.body.append(holder)
      holder.append(clone)

      try {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

        const rootRect = clone.getBoundingClientRect()
        const boundaries: ElementBoundary[] = []

        for (const element of clone.querySelectorAll(BLOCK_SELECTORS)) {
          const rect = element.getBoundingClientRect()
          const top = rect.top - rootRect.top
          const bottom = rect.bottom - rootRect.top
          if (bottom > top) {
            boundaries.push({ top, bottom, isHeading: false })
          }
        }

        for (const element of clone.querySelectorAll(HEADING_SELECTORS)) {
          const rect = element.getBoundingClientRect()
          const top = rect.top - rootRect.top
          const bottom = rect.bottom - rootRect.top
          if (bottom > top) {
            boundaries.push({ top, bottom, isHeading: true })
          }
        }

        onLayout({
          width: rootRect.width || sourceWidth,
          height: rootRect.height || context.element.getBoundingClientRect().height,
          boundaries,
        })
      }
      finally {
        holder.remove()
      }
    },
  }
}

function getPdfCaptureScale(content: HTMLElement): number {
  const rect = content.getBoundingClientRect()
  const sourceWidth = Math.max(1, rect.width)
  const sourceHeight = Math.max(1, rect.height, content.scrollHeight)
  const maxScale = Math.sqrt(PDF_CAPTURE_MAX_PIXELS / (sourceWidth * sourceHeight))

  return Math.max(1, Math.min(PDF_CAPTURE_SCALE, maxScale))
}

function canvasToJpegBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('无法压缩 PDF 页面图像'))
        return
      }

      void blob.arrayBuffer().then(
        buffer => resolve(new Uint8Array(buffer)),
        reject,
      )
    }, 'image/jpeg', PDF_IMAGE_QUALITY)
  })
}

function findSafePageBreaks(
  layout: CaptureLayout,
  canvasWidth: number,
  canvasHeight: number,
  pageHeight: number,
): number[] {
  const breaks: number[] = []
  const domToCanvasRatio = canvasWidth / layout.width
  const pageBreakSafetyPx = Math.max(1, Math.round(PAGE_BREAK_SAFETY_CSS_PX * domToCanvasRatio))
  const boundaries = layout.boundaries
    .map(({ top, bottom, isHeading }) => ({
      top: top * domToCanvasRatio,
      bottom: bottom * domToCanvasRatio,
      isHeading,
    }))
    .filter(({ bottom, top }) => bottom > top)
    .sort((a, b) => a.top - b.top)

  let idealBreak = pageHeight

  while (idealBreak < canvasHeight) {
    let safeBreak = idealBreak
    const conflicts = boundaries.filter(({ top, bottom }) => top < idealBreak && bottom > idealBreak)

    if (conflicts.length > 0) {
      const breakableConflicts = conflicts.filter(({ top, bottom }) => bottom - top < pageHeight)

      if (breakableConflicts.length > 0) {
        safeBreak = Math.min(...breakableConflicts.map(({ top }) => top)) - pageBreakSafetyPx
      }
    }

    const headingThreshold = 50 * domToCanvasRatio
    const headingsNearBreak = boundaries.filter(({ bottom, isHeading }) => (
      isHeading && bottom <= idealBreak && idealBreak - bottom < headingThreshold
    ))
    if (headingsNearBreak.length > 0) {
      const headingBreak = Math.min(...headingsNearBreak.map(({ top }) => top)) - pageBreakSafetyPx
      safeBreak = Math.min(safeBreak, headingBreak)
    }

    const lastBreak = breaks.length > 0 ? breaks[breaks.length - 1] : 0
    if (safeBreak <= lastBreak + MIN_PAGE_PROGRESS_PX) {
      safeBreak = idealBreak
    }

    breaks.push(safeBreak)
    idealBreak = safeBreak + pageHeight
  }

  return breaks
}

function createRasterAnalysisCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  if (canvas.width <= PDF_RASTER_ANALYSIS_MAX_WIDTH)
    return canvas

  const analysisCanvas = document.createElement('canvas')
  analysisCanvas.width = PDF_RASTER_ANALYSIS_MAX_WIDTH
  analysisCanvas.height = canvas.height

  const context = analysisCanvas.getContext('2d', { willReadFrequently: true })
  if (!context)
    return canvas

  context.drawImage(canvas, 0, 0, analysisCanvas.width, analysisCanvas.height)
  return analysisCanvas
}

function getRasterRowContentScores(
  canvas: HTMLCanvasElement,
  backgroundColor: readonly [number, number, number],
): number[] | null {
  const analysisCanvas = createRasterAnalysisCanvas(canvas)
  try {
    const context = analysisCanvas.getContext('2d', { willReadFrequently: true })
    if (!context || analysisCanvas.width === 0 || analysisCanvas.height === 0)
      return null

    const data = context.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height).data
    const scores = Array.from({ length: analysisCanvas.height }, () => 0)

    for (let y = 0; y < analysisCanvas.height; y++) {
      let contentPixels = 0
      const rowOffset = y * analysisCanvas.width * 4

      for (let x = 0; x < analysisCanvas.width; x++) {
        const pixelOffset = rowOffset + x * 4
        if (data[pixelOffset + 3] === 0)
          continue

        const contrast = Math.max(
          Math.abs(data[pixelOffset] - backgroundColor[0]),
          Math.abs(data[pixelOffset + 1] - backgroundColor[1]),
          Math.abs(data[pixelOffset + 2] - backgroundColor[2]),
        )
        if (contrast >= RASTER_CONTENT_CONTRAST)
          contentPixels++
      }

      scores[y] = contentPixels / analysisCanvas.width
    }

    return scores
  }
  catch {
    return null
  }
  finally {
    if (analysisCanvas !== canvas) {
      analysisCanvas.width = 0
      analysisCanvas.height = 0
    }
  }
}

function findRasterSafeBreak(
  rowScores: readonly number[],
  proposedBreak: number,
  previousBreak: number,
  searchPx: number,
  clearancePx: number,
): number | null {
  const minBreak = Math.max(
    previousBreak + MIN_PAGE_PROGRESS_PX,
    clearancePx + 1,
  )
  const minCandidate = Math.max(minBreak, Math.floor(proposedBreak - searchPx))
  const maxCandidate = Math.min(
    rowScores.length - clearancePx - 1,
    Math.floor(proposedBreak),
  )

  let bestBreak: number | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  let bestBusyRows = Number.POSITIVE_INFINITY

  for (let candidate = minCandidate; candidate <= maxCandidate; candidate++) {
    let busyRows = 0
    const start = Math.max(0, candidate - clearancePx)
    const end = Math.min(rowScores.length - 1, candidate + clearancePx)

    for (let y = start; y <= end; y++) {
      if (rowScores[y] >= RASTER_BUSY_ROW_RATIO)
        busyRows++
    }

    if (busyRows > 3)
      continue

    const distance = Math.abs(candidate - proposedBreak)
    if (busyRows < bestBusyRows || (busyRows === bestBusyRows && distance < bestDistance)) {
      bestBreak = candidate
      bestBusyRows = busyRows
      bestDistance = distance
    }
  }

  return bestBreak
}

function alignPageBreaksToRaster(
  canvas: HTMLCanvasElement,
  pageBreaks: readonly number[],
  backgroundColor: readonly [number, number, number],
  pageHeight: number,
  canvasScale: number,
): number[] {
  const rowScores = getRasterRowContentScores(canvas, backgroundColor)
  if (!rowScores)
    return [...pageBreaks]

  const searchPx = Math.max(1, Math.round(RASTER_BREAK_SEARCH_CSS_PX * canvasScale))
  const clearancePx = Math.max(1, Math.round(RASTER_BREAK_CLEARANCE_CSS_PX * canvasScale))

  const alignedBreaks: number[] = []
  let previousBreak = 0
  let pageBreakIndex = 0

  while (previousBreak + pageHeight < canvas.height) {
    const proposedBreak = pageBreakIndex < pageBreaks.length
      ? pageBreaks[pageBreakIndex]
      : previousBreak + pageHeight
    const boundedBreak = Math.min(proposedBreak, previousBreak + pageHeight, canvas.height - 1)
    const alignedBreak = findRasterSafeBreak(rowScores, boundedBreak, previousBreak, searchPx, clearancePx)
    const nextBreak = alignedBreak ?? Math.max(previousBreak + MIN_PAGE_PROGRESS_PX, boundedBreak)
    alignedBreaks.push(nextBreak)
    previousBreak = nextBreak
    pageBreakIndex++
  }

  return alignedBreaks
}

async function exportPreviewToPdf(exportPreview: PreviewIframe, loadingToast: string | number) {
  const { snapdom } = await import('@zumer/snapdom')
  const { default: JsPDF } = await import('jspdf')
  const restoreImages = await inlineImages([exportPreview.content])

  try {
    await Promise.all([
      document.fonts.ready,
      exportPreview.iframe.contentDocument?.fonts.ready ?? Promise.resolve(),
    ])

    let captureLayout: CaptureLayout | null = null
    const snapshot = await snapdom(exportPreview.content, {
      plugins: [createCaptureLayoutPlugin((layout) => {
        captureLayout = layout
      })],
    })
    const canvas = await snapshot.toCanvas({ scale: getPdfCaptureScale(exportPreview.content) })

    if (canvas.width === 0 || canvas.height === 0) {
      toast.error('没有可导出的内容', { id: loadingToast })
      return
    }

    const a4Width = 210
    const a4Height = 297
    const padding = 8

    const contentWidth = a4Width - padding * 2
    const contentHeight = a4Height - padding * 3

    const scale = contentWidth / canvas.width
    const canvasPageHeight = contentHeight / scale
    const bgColor = parsePdfBackgroundColor(getComputedStyle(exportPreview.content).backgroundColor)

    const layout = captureLayout ?? {
      width: exportPreview.content.getBoundingClientRect().width,
      height: exportPreview.content.getBoundingClientRect().height,
      boundaries: [],
    }
    const canvasScale = canvas.width / Math.max(1, layout.width)
    const pageBreaks = alignPageBreaksToRaster(canvas, findSafePageBreaks(
      layout,
      canvas.width,
      canvas.height,
      canvasPageHeight,
    ), bgColor, canvasPageHeight, canvasScale)

    const cssBackground = `rgb(${bgColor[0]}, ${bgColor[1]}, ${bgColor[2]})`

    const pdf = new JsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    })

    let prevBreak = 0
    for (let i = 0; i <= pageBreaks.length; i++) {
      if (i > 0) {
        pdf.addPage()
      }

      pdf.setFillColor(bgColor[0], bgColor[1], bgColor[2])
      pdf.rect(0, 0, a4Width, a4Height, 'F')

      const sourceY = Math.round(prevBreak)
      const sourceEnd = i < pageBreaks.length
        ? Math.min(canvas.height, Math.max(sourceY, Math.round(pageBreaks[i])))
        : canvas.height
      const sourceHeight = sourceEnd - sourceY

      if (sourceHeight <= 0)
        continue

      const targetHeight = sourceHeight * scale

      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = canvas.width
      pageCanvas.height = sourceHeight

      const ctx = pageCanvas.getContext('2d')
      if (!ctx) {
        throw new Error('无法创建 canvas context')
      }

      ctx.fillStyle = cssBackground
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
      ctx.drawImage(
        canvas,
        0,
        sourceY,
        canvas.width,
        sourceHeight,
        0,
        0,
        canvas.width,
        sourceHeight,
      )

      try {
        const pageImageBytes = await canvasToJpegBytes(pageCanvas)
        pdf.addImage(pageImageBytes, 'JPEG', padding, padding * 1.5, contentWidth, targetHeight)
      }
      finally {
        pageCanvas.width = 0
        pageCanvas.height = 0
      }

      prevBreak = sourceEnd
    }

    pdf.save('bm.md.pdf')
    toast.success('已导出 PDF', { id: loadingToast })
  }
  finally {
    restoreImages()
  }
}

export async function exportPdf() {
  if (isExporting) {
    toast.info('正在导出中，请稍候...')
    return
  }

  const preview = getPreviewIframe()
  if (!preview)
    return

  isExporting = true
  const loadingToast = toast.loading('正在生成 PDF...')

  try {
    await withPreviewImageCaptions(exportPreview => exportPreviewToPdf(exportPreview, loadingToast))
  }
  catch (error) {
    console.error(error)
    if (error instanceof Error && error.message.includes('import')) {
      toast.error('PDF 组件加载失败，请刷新重试', { id: loadingToast })
    }
    else {
      toast.error('导出 PDF 失败', { id: loadingToast })
    }
  }
  finally {
    isExporting = false
  }
}

export function printPreview() {
  const preview = getPreviewIframe()
  if (!preview)
    return

  try {
    const contentWindow = preview.iframe.contentWindow
    if (!contentWindow) {
      toast.error('无法访问预览窗口')
      return
    }

    const body = preview.iframe.contentDocument?.body
    const previousValue = body?.dataset.showImageCaption
    setPreviewImageCaptionVisibility(preview.iframe, true)

    try {
      contentWindow.print()
    }
    finally {
      if (body) {
        if (previousValue === undefined) {
          delete body.dataset.showImageCaption
        }
        else {
          body.dataset.showImageCaption = previousValue
        }
      }
    }
  }
  catch (error) {
    toast.error('打印失败')
    console.error(error)
  }
}
