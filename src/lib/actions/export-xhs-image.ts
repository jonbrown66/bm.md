import { toast } from 'sonner'

const XHS_EXPORT_DPR = 2

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsDataURL(blob)
  })
}

async function fetchImageBlob(url: URL) {
  try {
    const response = await fetch(url.href)
    if (response.ok) {
      return response.blob()
    }
  }
  catch {
    // 跨域读取失败时使用同源图片代理。
  }

  const proxied = await fetch(`/api/proxy/image?url=${encodeURIComponent(url.href)}`)
  if (!proxied.ok) {
    throw new Error(`图片代理失败: ${proxied.status}`)
  }

  return proxied.blob()
}

async function inlinePageImages(pages: HTMLElement[]) {
  const images = pages.flatMap(page => Array.from(page.querySelectorAll('img')))
  const dataUrlCache = new Map<string, Promise<string>>()

  await Promise.all(images.map(async (image) => {
    image.loading = 'eager'
    image.decoding = 'sync'

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
      let dataUrl = dataUrlCache.get(url.href)
      if (!dataUrl) {
        dataUrl = fetchImageBlob(url).then(blobToDataUrl)
        dataUrlCache.set(url.href, dataUrl)
      }

      image.src = await dataUrl
      image.removeAttribute('srcset')
      image.removeAttribute('sizes')
    }
    catch (error) {
      console.warn('小红书导出图片内联失败:', source, error)
    }
  }))
}

async function waitForPageImages(page: HTMLElement) {
  const images = Array.from(page.querySelectorAll('img'))
  await Promise.all(images.map(async (image) => {
    if (!image.complete) {
      await new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => resolve(), { once: true })
      })
    }

    try {
      await image.decode()
    }
    catch {
      // 图片损坏时保留浏览器 fallback，让 SnapDOM 继续导出当前画面。
    }
  }))
}

function downloadPngImage(image: HTMLImageElement, filename: string) {
  const link = document.createElement('a')
  link.href = image.src
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function disableExportScrollContainers(page: HTMLElement) {
  page.querySelectorAll<HTMLElement>('pre, pre code, figure.figure-table').forEach((element) => {
    element.style.setProperty('overflow', 'hidden', 'important')
    element.style.setProperty('overflow-x', 'hidden', 'important')
    element.style.setProperty('overflow-y', 'hidden', 'important')
    element.style.setProperty('scrollbar-width', 'none', 'important')
  })
}

async function capturePage(
  page: HTMLElement,
  pageNumber: number,
  snapdom: typeof import('@zumer/snapdom').snapdom,
) {
  const previousBoxShadow = page.style.boxShadow
  page.style.boxShadow = 'none'

  try {
    const snapshot = await snapdom(page, {
      cache: 'full',
      dpr: XHS_EXPORT_DPR,
      embedFonts: true,
      fast: true,
      height: page.offsetHeight,
      placeholders: false,
      width: page.offsetWidth,
    })

    const image = await snapshot.toPng({
      dpr: XHS_EXPORT_DPR,
      height: page.offsetHeight,
      width: page.offsetWidth,
    })
    await image.decode()
    downloadPngImage(image, `bm-md-xhs-${String(pageNumber).padStart(2, '0')}.png`)
  }
  finally {
    if (previousBoxShadow) {
      page.style.boxShadow = previousBoxShadow
    }
    else {
      page.style.removeProperty('box-shadow')
    }
  }
}

async function exportXhsPages(pageIndex?: number) {
  const pages = Array.from(
    document.querySelectorAll<HTMLElement>('[data-xhs-export-page="true"]'),
  )
  const indexedPage = pageIndex === undefined ? undefined : pages[pageIndex]
  const selectedPages = pageIndex === undefined
    ? pages.map((page, index) => ({ page, index }))
    : indexedPage
      ? [{ page: indexedPage, index: pageIndex }]
      : []

  if (selectedPages.length === 0) {
    toast.error('没有可导出的小红书图片')
    return
  }

  try {
    const pageElements = selectedPages.map(({ page }) => page)
    const { preCache, snapdom } = await import('@zumer/snapdom')

    await document.fonts.ready
    await inlinePageImages(pageElements)
    await Promise.all(pageElements.map(waitForPageImages))
    pageElements.forEach(disableExportScrollContainers)

    if (pageElements.length > 1) {
      await preCache(pageElements[0]?.parentElement ?? document, {
        cache: 'full',
        embedFonts: true,
      })
    }

    for (const { page, index } of selectedPages) {
      await capturePage(page, index + 1, snapdom)
    }

    toast.success(pageIndex === undefined
      ? `已导出 ${selectedPages.length} 张小红书图片`
      : `已导出第 ${pageIndex + 1} 张小红书图片`)
  }
  catch (error) {
    toast.error('导出小红书图片失败')
    console.error(error)
  }
}

export async function exportXhsImage(pageIndex: number) {
  await exportXhsPages(pageIndex)
}

export async function exportXhsImages() {
  await exportXhsPages()
}
