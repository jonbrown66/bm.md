import { MAX_SOURCE_IMAGE_BYTES } from '@/lib/image-upload-policy'
import { uploadImage, uploadRemoteImages } from '@/services/upload'

/** 仅替换本次复制的 HTML，编辑器内的原图链接保持不变。 */
export async function prepareWechatImages(html: string): Promise<string> {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const images = Array.from(doc.querySelectorAll('img'))
  if (images.length === 0) {
    return html
  }

  const sources = new Map<string, HTMLImageElement[]>()
  for (const image of images) {
    const source = image.getAttribute('src')
    if (!source) {
      continue
    }
    const url = new URL(source, window.location.href)
    if (!['http:', 'https:', 'data:', 'blob:'].includes(url.protocol)) {
      throw new Error('公众号图片只支持网络图片或内嵌图片，请先上传本地图片')
    }
    const matchingImages = sources.get(url.href) ?? []
    matchingImages.push(image)
    sources.set(url.href, matchingImages)
  }

  const replacements = new Map<string, string>()
  const remoteUrls = Array.from(sources.keys()).filter(url => /^https?:/.test(url))
  // 与批量上传接口的 30 张上限一致；服务端每批最多同时处理两张。
  for (let index = 0; index < remoteUrls.length; index += 30) {
    const batch = remoteUrls.slice(index, index + 30)
    const { results } = await uploadRemoteImages(batch, 'wechat')
    for (const source of batch) {
      const result = results.find(result => result.oldUrl === source)
      if (result?.status !== 'success' || !result.newUrl) {
        throw new Error(`公众号图片处理失败：${result?.error || '未返回图片链接'}。请手动处理后重试`)
      }
      replacements.set(source, result.newUrl)
    }
  }

  // Mermaid 生成的 data URL 也上传为小尺寸图片，避免把大段 Base64 带入微信。
  for (const source of sources.keys()) {
    if (/^https?:/.test(source)) {
      continue
    }
    // 防止超大 Base64 字符串在解码前耗尽浏览器内存。
    if (source.startsWith('data:') && source.length > MAX_SOURCE_IMAGE_BYTES * 1.4) {
      throw new Error('内嵌图片超过 50MB，请先缩小图片')
    }
    const response = await fetch(source)
    if (!response.ok) {
      throw new Error('内嵌图片读取失败，请重新生成图片')
    }
    const formData = new FormData()
    formData.set('file', await response.blob())
    formData.set('name', 'wechat-image.png')
    formData.set('target', 'wechat')
    const result = await uploadImage(formData)
    if (!result.url) {
      throw new Error('公众号图片处理失败：未返回图片链接')
    }
    replacements.set(source, result.url)
  }

  for (const [source, matchingImages] of sources) {
    const replacement = replacements.get(source)
    if (!replacement) {
      continue
    }
    for (const image of matchingImages) {
      image.setAttribute('src', replacement)
      image.removeAttribute('srcset')
      image.removeAttribute('sizes')
      image.removeAttribute('data-original')
      if (image.hasAttribute('data-src')) {
        image.setAttribute('data-src', replacement)
      }
    }
  }
  return doc.body.innerHTML
}
