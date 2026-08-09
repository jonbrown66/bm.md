interface ImageSnapshot {
  image: HTMLImageElement
  src: string | null
  srcset: string | null
  sizes: string | null
  loading: string | null
  decoding: string | null
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)), { once: true })
    reader.addEventListener('error', () => reject(reader.error), { once: true })
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

async function waitForImage(image: HTMLImageElement) {
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
    // 图片损坏时保留浏览器 fallback，让导出继续完成。
  }
}

function restoreAttribute(element: Element, name: string, value: string | null) {
  if (value === null) {
    element.removeAttribute(name)
  }
  else {
    element.setAttribute(name, value)
  }
}

export async function inlineImages(containers: readonly HTMLElement[]) {
  const images = Array.from(new Set(
    containers.flatMap(container => Array.from(container.querySelectorAll<HTMLImageElement>('img'))),
  ))
  const snapshots: ImageSnapshot[] = images.map(image => ({
    image,
    src: image.getAttribute('src'),
    srcset: image.getAttribute('srcset'),
    sizes: image.getAttribute('sizes'),
    loading: image.getAttribute('loading'),
    decoding: image.getAttribute('decoding'),
  }))
  const dataUrlCache = new Map<string, Promise<string>>()
  let restored = false

  const restore = () => {
    if (restored) {
      return
    }

    restored = true
    snapshots.forEach(({ image, src, srcset, sizes, loading, decoding }) => {
      restoreAttribute(image, 'src', src)
      restoreAttribute(image, 'srcset', srcset)
      restoreAttribute(image, 'sizes', sizes)
      restoreAttribute(image, 'loading', loading)
      restoreAttribute(image, 'decoding', decoding)
    })
  }

  try {
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
        console.warn('导出图片内联失败:', source, error)
      }
    }))

    await Promise.all(images.map(waitForImage))
    return restore
  }
  catch (error) {
    restore()
    throw error
  }
}
