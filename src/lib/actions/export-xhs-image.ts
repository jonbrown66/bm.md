import { toast } from 'sonner'

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
    // 前端跨域读取失败时走同源代理兜底。
  }

  const proxied = await fetch(`/api/proxy/image?url=${encodeURIComponent(url.href)}`)
  if (!proxied.ok) {
    throw new Error(`图片代理失败: ${proxied.status}`)
  }

  return proxied.blob()
}

async function inlineRemoteImages(page: HTMLElement) {
  const images = Array.from(page.querySelectorAll('img'))

  await Promise.all(images.map(async (image) => {
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
      image.src = await blobToDataUrl(await fetchImageBlob(url))
      image.removeAttribute('srcset')
      image.removeAttribute('sizes')
    }
    catch (error) {
      console.warn('小红书导出图片内联失败:', source, error)
    }
  }))
}

async function waitForPageAssets(page: HTMLElement) {
  await document.fonts.ready

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
      // 图片损坏时 decode 会失败，保留浏览器 fallback 让 snapdom 继续导出。
    }
  }))
}

function copyComputedStyles(source: Element, target: Element) {
  if (!(source instanceof HTMLElement || source instanceof SVGElement)) {
    return
  }

  if (!(target instanceof HTMLElement || target instanceof SVGElement)) {
    return
  }

  const sourceStyle = window.getComputedStyle(source)
  for (const property of sourceStyle) {
    target.style.setProperty(
      property,
      sourceStyle.getPropertyValue(property),
      sourceStyle.getPropertyPriority(property),
    )
  }
}

function freezeComputedStyles(sourceRoot: HTMLElement, targetRoot: HTMLElement) {
  copyComputedStyles(sourceRoot, targetRoot)

  const sourceElements = Array.from(sourceRoot.querySelectorAll('*'))
  const targetElements = Array.from(targetRoot.querySelectorAll('*'))
  sourceElements.forEach((sourceElement, index) => {
    const targetElement = targetElements[index]
    if (targetElement) {
      copyComputedStyles(sourceElement, targetElement)
    }
  })
}

function forceExportStyles(page: HTMLElement) {
  page.querySelectorAll<HTMLElement>('pre').forEach((pre) => {
    pre.style.setProperty('max-width', '100%', 'important')
    pre.style.setProperty('min-width', '0', 'important')
    pre.style.setProperty('overflow', 'visible', 'important')
    pre.style.setProperty('overflow-wrap', 'anywhere', 'important')
    pre.style.setProperty('white-space', 'pre-wrap', 'important')
    pre.style.setProperty('word-break', 'break-word', 'important')
  })

  page.querySelectorAll<HTMLElement>('pre code, pre code *').forEach((code) => {
    code.style.setProperty('display', 'block', 'important')
    code.style.setProperty('max-width', '100%', 'important')
    code.style.setProperty('min-width', '0', 'important')
    code.style.setProperty('overflow-wrap', 'anywhere', 'important')
    code.style.setProperty('white-space', 'pre-wrap', 'important')
    code.style.setProperty('word-break', 'break-word', 'important')
  })

  page.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    image.loading = 'eager'
    image.decoding = 'sync'
    image.style.setProperty('display', 'block', 'important')
    image.style.setProperty('height', 'auto', 'important')
    image.style.setProperty('max-height', '760px', 'important')
    image.style.setProperty('max-width', '100%', 'important')
    image.style.setProperty('object-fit', 'contain', 'important')
    image.style.setProperty('visibility', 'visible', 'important')
    image.style.setProperty('width', 'auto', 'important')
  })
}

async function createExportClone(page: HTMLElement) {
  const clone = page.cloneNode(true) as HTMLElement
  freezeComputedStyles(page, clone)
  forceExportStyles(clone)

  clone.style.position = 'fixed'
  clone.style.top = '0'
  clone.style.left = '0'
  clone.style.zIndex = '-1'
  clone.style.pointerEvents = 'none'
  clone.style.boxShadow = 'none'
  clone.style.transform = 'none'

  document.body.appendChild(clone)

  await inlineRemoteImages(clone)
  await waitForPageAssets(clone)

  return clone
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

export async function exportXhsImages() {
  const pages = Array.from(
    document.querySelectorAll<HTMLElement>('[data-xhs-export-page="true"]'),
  )

  if (pages.length === 0) {
    toast.error('没有可导出的小红书图片')
    return
  }

  try {
    const { snapdom } = await import('@zumer/snapdom')

    for (const [index, page] of pages.entries()) {
      let clone: HTMLElement | null = null
      try {
        clone = await createExportClone(page)
        const snapshot = await snapdom(clone, {
          cache: 'disabled',
          dpr: 1,
          embedFonts: true,
          fast: false,
          height: clone.offsetHeight,
          placeholders: false,
          width: clone.offsetWidth,
        })

        const image = await snapshot.toPng({
          dpr: 1,
          format: 'png',
          height: clone.offsetHeight,
          width: clone.offsetWidth,
        })
        await image.decode()
        downloadPngImage(image, `bm-md-xhs-${String(index + 1).padStart(2, '0')}.png`)
      }
      finally {
        clone?.remove()
      }
    }

    toast.success(`已导出 ${pages.length} 张小红书图片`)
  }
  catch (error) {
    toast.error('导出小红书图片失败')
    console.error(error)
  }
}
