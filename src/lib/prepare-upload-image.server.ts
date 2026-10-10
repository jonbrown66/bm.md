import type { ImageUploadTarget } from './image-upload-policy'
import type { StorageProvider, UploadOptions, UploadResult } from '@/storage/types'
import { detectImageContentType } from './image-content'
import {
  ImageProcessingError,
  MAX_SOURCE_IMAGE_BYTES,
  MAX_UPLOAD_IMAGE_BYTES,
  MAX_WECHAT_IMAGE_BYTES,
  SOURCE_IMAGE_SIZE_ERROR,
} from './image-upload-policy'

const maxInputPixels = 40_000_000
const maxCachedCopies = 128
const copyCacheLifetime = 10 * 60 * 1000
const uploadedCopies = new Map<string, { url: string, expiresAt: number }>()
const pendingCopies = new Map<string, Promise<UploadResult>>()
const uploadQueues = new Map<string, Promise<void>>()

/** 按输出内容复用成功副本，并合并同一副本的并发上传。 */
export async function uploadPreparedWechatImage(options: UploadOptions, storage: StorageProvider): Promise<UploadResult> {
  const scope = storage.cacheScope
  if (!scope) {
    return storage.upload(options)
  }
  const digest = await crypto.subtle.digest('SHA-256', await options.file.arrayBuffer())
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  const key = JSON.stringify([scope, options.contentType, hash])
  const cached = uploadedCopies.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return { url: cached.url }
  }
  uploadedCopies.delete(key)
  const pending = pendingCopies.get(key)
  if (pending) {
    return pending
  }

  // 同一图床的新增副本串行提交，避免 GitHub 分支同时写入产生冲突。
  const previous = uploadQueues.get(scope) ?? Promise.resolve()
  const upload = previous.then(() => storage.upload(options)).then((result) => {
    if (!result.url) {
      throw new ImageProcessingError('存储服务未返回图片链接', 500)
    }
    if (uploadedCopies.size >= maxCachedCopies) {
      const oldestKey = uploadedCopies.keys().next().value
      if (oldestKey !== undefined) {
        uploadedCopies.delete(oldestKey)
      }
    }
    uploadedCopies.set(key, { url: result.url, expiresAt: Date.now() + copyCacheLifetime })
    return result
  }).finally(() => {
    pendingCopies.delete(key)
  })
  pendingCopies.set(key, upload)
  const settled = upload.then(() => undefined, () => undefined)
  uploadQueues.set(scope, settled)
  void settled.then(() => {
    if (uploadQueues.get(scope) === settled) {
      uploadQueues.delete(scope)
    }
  })
  return upload
}

/** libvips 不支持 APNG 动画解码，必须在转换前识别，防止丢帧。 */
function isAnimatedPng(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    if (type === 'acTL') {
      return true
    }
    if (type === 'IDAT' || type === 'IEND') {
      return false
    }
    offset += length + 12
  }
  return false
}

export async function prepareUploadImage(options: UploadOptions, target: ImageUploadTarget = 'default'): Promise<UploadOptions> {
  const wechat = target === 'wechat'
  const maxBytes = wechat ? MAX_WECHAT_IMAGE_BYTES : MAX_UPLOAD_IMAGE_BYTES
  const sizeLabel = wechat ? '5MB' : '10MB'
  if (options.file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new ImageProcessingError(SOURCE_IMAGE_SIZE_ERROR, 413)
  }
  if (!wechat && options.file.size <= maxBytes) {
    return options
  }

  const bytes = new Uint8Array(await options.file.arrayBuffer())
  const type = detectImageContentType(bytes)
  if (wechat && options.file.size <= maxBytes && ['image/jpeg', 'image/png', 'image/gif'].includes(type ?? '')) {
    return options
  }
  if (type === 'image/png' && isAnimatedPng(bytes)) {
    throw new ImageProcessingError(`APNG 动图超过 ${sizeLabel}，暂不支持保留动画压缩，请先手动压缩`)
  }
  // 仅转换可确认动画特性的格式，避免将 SVG 动画或 AVIF 序列转成静态图。
  if (!type) {
    throw new ImageProcessingError(`此图片格式暂不支持自动转换，请先手动转换为 ${sizeLabel} 以内的 JPG、PNG 或 GIF`)
  }

  try {
    // 仅在服务端确需压缩时加载原生模块，小图直接沿用原始字节。
    const { default: sharp } = await import('sharp')
    const metadata = await sharp(bytes, { limitInputPixels: maxInputPixels }).metadata()
    const pages = metadata.pages ?? 1
    const width = metadata.width
    const height = metadata.pageHeight ?? metadata.height
    if (!width || !height || width * height * pages > maxInputPixels) {
      throw new ImageProcessingError('图片总像素超过 4000 万（动图包含全部帧），请先缩小图片')
    }

    const animated = pages > 1
    const format = wechat
      ? (animated ? 'gif' : metadata.hasAlpha ? 'png' : 'jpg')
      : (animated || metadata.hasAlpha ? 'webp' : 'jpg')
    const contentType = `image/${format === 'jpg' ? 'jpeg' : format}`
    const deadline = Date.now() + 30_000
    const attempts = [
      { scale: 1, quality: 90 },
      ...(['jpg', 'webp'].includes(format)
        ? [{ scale: 1, quality: 80 }, { scale: 1, quality: 70 }]
        : []),
      { scale: 0.8, quality: 75 },
      { scale: 0.6, quality: 75 },
      { scale: 0.4, quality: 75 },
      { scale: 0.25, quality: 75 },
      ...(wechat ? [{ scale: 0.15, quality: 75 }, { scale: 0.1, quality: 75 }] : []),
    ]

    for (const { scale, quality } of attempts) {
      const remainingSeconds = Math.floor((deadline - Date.now()) / 1000)
      if (remainingSeconds < 1) {
        break
      }
      let pipeline = sharp(bytes, { animated, limitInputPixels: maxInputPixels })
      if (!animated) {
        pipeline = pipeline.rotate()
      }
      const orientedWidth = !animated && (metadata.orientation ?? 0) >= 5 ? height : width
      const orientedHeight = !animated && (metadata.orientation ?? 0) >= 5 ? width : height
      const maxDimension = format === 'webp' ? 16383 : 65500
      pipeline = pipeline.resize({
        width: Math.min(maxDimension, Math.max(1, Math.floor(orientedWidth * scale))),
        height: Math.min(maxDimension, Math.max(1, Math.floor(orientedHeight * scale))),
        fit: 'inside',
        withoutEnlargement: true,
      })
      if (format === 'webp') {
        pipeline = pipeline.webp({ quality, alphaQuality: 100, effort: 3, loop: metadata.loop, delay: metadata.delay })
      }
      else if (format === 'gif') {
        pipeline = pipeline.gif({ effort: 3, loop: metadata.loop, delay: metadata.delay })
      }
      else if (format === 'png') {
        // PNG 使用无损压缩，尺寸不足时再缩图，保留完整透明通道。
        pipeline = pipeline.png({ compressionLevel: 9 })
      }
      else {
        pipeline = pipeline.jpeg({ quality, chromaSubsampling: '4:4:4' })
      }
      const output = await pipeline.timeout({ seconds: Math.min(10, remainingSeconds) }).toBuffer()
      if (output.byteLength <= maxBytes) {
        return {
          file: new Blob([new Uint8Array(output)], { type: contentType }),
          filename: `${options.filename.replace(/\.[^.]*$/, '') || 'image'}.${format}`,
          contentType,
        }
      }
    }
    throw new ImageProcessingError(animated
      ? `无法在保留动画的情况下压缩至 ${sizeLabel}，请先手动压缩动图`
      : `无法压缩至 ${sizeLabel}，请先手动缩小图片`)
  }
  catch (error) {
    if (error instanceof ImageProcessingError) {
      throw error
    }
    throw new ImageProcessingError(`图片压缩失败（格式损坏、像素过大、处理超时或运行环境不支持），请先手动压缩至 ${sizeLabel}`)
  }
}
