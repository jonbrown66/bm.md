import type { StorageProvider, UploadOptions, UploadResult } from '@/storage/types'
import { detectImageContentType } from './image-content'
import {
  ImageProcessingError,
  MAX_SOURCE_IMAGE_BYTES,
  MAX_UPLOAD_IMAGE_BYTES,
  SOURCE_IMAGE_SIZE_ERROR,
} from './image-upload-policy'

/** 单帧图片最大像素（约 4000 万像素，如 8000x5000）。 */
const maxFramePixels = 40_000_000
/** 限制全部动画帧的解码量，避免多图并发耗尽服务端内存。 */
const maxAnimatedTotalPixels = 120_000_000
const maxCachedCopies = 128
const copyCacheLifetime = 10 * 60 * 1000
const uploadedCopies = new Map<string, { url: string, expiresAt: number }>()
const pendingCopies = new Map<string, Promise<UploadResult>>()
const uploadQueues = new Map<string, Promise<void>>()

/** 同内容合并上传，新增图片批量提交；缓存只记录成功结果。 */
export async function uploadPreparedImages(options: UploadOptions[], storage: StorageProvider): Promise<PromiseSettledResult<UploadResult>[]> {
  const verify = async (result: UploadResult): Promise<UploadResult> => {
    if (!result.url) {
      throw new ImageProcessingError('存储服务未返回图片链接', 500)
    }
    return { url: storage.resolveUploadedImageUrl ? await storage.resolveUploadedImageUrl(result.url) : result.url }
  }
  const scope = storage.cacheScope
  if (!scope) {
    return Promise.allSettled(options.map(async image => verify(await storage.upload(image))))
  }
  const owned: { key: string, image: UploadOptions, resolve: (result: UploadResult) => void, reject: (error: unknown) => void }[] = []
  const jobs = await Promise.all(options.map(async (image) => {
    const digest = await crypto.subtle.digest('SHA-256', await image.file.arrayBuffer())
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    const key = JSON.stringify([scope, image.contentType, hash])
    const cached = uploadedCopies.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      try {
        const result = await verify(cached)
        cached.url = result.url
        return { promise: Promise.resolve(result) }
      }
      catch {
        // 已有副本无法恢复时，使用当前请求持有的图片内容重新上传。
      }
    }
    uploadedCopies.delete(key)
    const pending = pendingCopies.get(key)
    if (pending) {
      return { promise: pending }
    }
    const promise = new Promise<UploadResult>((resolve, reject) => owned.push({ key, image, resolve, reject }))
    pendingCopies.set(key, promise)
    return { promise }
  }))
  const results = Promise.allSettled(jobs.map(job => job.promise))
  if (!owned.length) {
    return results
  }
  const finish = async (job: typeof owned[number], result: UploadResult) => {
    try {
      const verified = await verify(result)
      if (uploadedCopies.size >= maxCachedCopies) {
        const oldestKey = uploadedCopies.keys().next().value
        if (oldestKey !== undefined) {
          uploadedCopies.delete(oldestKey)
        }
      }
      uploadedCopies.set(job.key, { url: verified.url, expiresAt: Date.now() + copyCacheLifetime })
      job.resolve(verified)
    }
    catch (error) {
      // 写入已成功时，外链故障只影响此图片，不触发整批重复写入。
      job.reject(error)
    }
  }
  const previous = uploadQueues.get(scope) ?? Promise.resolve()
  const settled = previous.then(async () => {
    try {
      if (owned.length > 1 && storage.uploadMany) {
        const uploaded = await storage.uploadMany(owned.map(job => job.image))
        if (uploaded.length !== owned.length || uploaded.some(result => !result.url)) {
          throw new ImageProcessingError('存储服务未返回完整图片链接', 500)
        }
        await Promise.all(owned.map((job, index) => finish(job, uploaded[index])))
      }
      else {
        for (const job of owned) {
          try {
            await finish(job, await storage.upload(job.image))
          }
          catch (error) {
            job.reject(error)
          }
        }
      }
    }
    catch {
      // 批量提交失败时逐项恢复，避免单张错误丢掉其他图片的成功结果。
      for (const job of owned) {
        try {
          await finish(job, await storage.upload(job.image))
        }
        catch (failure) {
          job.reject(failure)
        }
      }
    }
    finally {
      owned.forEach(job => pendingCopies.delete(job.key))
    }
  })
  uploadQueues.set(scope, settled)
  void settled.then(() => {
    if (uploadQueues.get(scope) === settled) {
      uploadQueues.delete(scope)
    }
  })
  return results
}

export async function uploadPreparedImage(options: UploadOptions, storage: StorageProvider): Promise<UploadResult> {
  const [result] = await uploadPreparedImages([options], storage)
  if (result.status === 'rejected') {
    throw result.reason
  }
  return result.value
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

export async function prepareUploadImage(options: UploadOptions): Promise<UploadOptions> {
  const maxBytes = MAX_UPLOAD_IMAGE_BYTES
  const sizeLabel = '5MB 以下'
  if (options.file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new ImageProcessingError(SOURCE_IMAGE_SIZE_ERROR, 413)
  }
  const bytes = new Uint8Array(await options.file.arrayBuffer())
  const type = detectImageContentType(bytes)
  if (type === 'image/png' && isAnimatedPng(bytes)) {
    throw new ImageProcessingError('暂不支持 APNG 动图，请先转换为 GIF，避免动画丢帧')
  }
  // 仅转换可确认动画特性的格式，避免将 SVG 动画或 AVIF 序列转成静态图。
  if (!type) {
    throw new ImageProcessingError(`此图片格式暂不支持自动转换，请先手动转换为 ${sizeLabel} 以内的 JPG、PNG 或 GIF`)
  }

  try {
    // 元数据校验不会重新编码小图；确需转换时才执行压缩。
    const { default: sharp } = await import('sharp')
    sharp.cache({ memory: 32, files: 0, items: 20 })
    const metadata = await sharp(bytes, { limitInputPixels: maxAnimatedTotalPixels }).metadata()
    if (options.file.size <= maxBytes && ['image/jpeg', 'image/png', 'image/gif'].includes(type)) {
      return { ...options, contentType: type, filename: `${options.filename.replace(/\.[^.]*$/, '') || 'image'}.${type === 'image/jpeg' ? 'jpg' : type.split('/')[1]}` }
    }
    const pages = metadata.pages ?? 1
    const width = metadata.width
    const height = metadata.pageHeight ?? metadata.height
    const framePixels = (width ?? 0) * (height ?? 0)
    if (!width || !height || framePixels > maxFramePixels) {
      throw new ImageProcessingError('图片单帧分辨率过大（超过 4000 万像素），请先缩小图片尺寸')
    }
    if (pages > 1 && framePixels * pages > maxAnimatedTotalPixels) {
      throw new ImageProcessingError('动图全部帧超过 1.2 亿像素，请先缩小动图尺寸或减少帧数')
    }

    const animated = pages > 1
    const format = animated ? 'gif' : metadata.hasAlpha ? 'png' : 'jpg'
    const contentType = `image/${format === 'jpg' ? 'jpeg' : format}`
    const deadline = Date.now() + 30_000

    const orientedWidth = !animated && (metadata.orientation ?? 0) >= 5 ? height : width
    const orientedHeight = !animated && (metadata.orientation ?? 0) >= 5 ? width : height

    // 大动图先缩至适合文章展示的宽度，减少编码耗时。
    const maxAnimatedGifWidth = 900
    const gifStartScale = (animated && format === 'gif' && orientedWidth > maxAnimatedGifWidth)
      ? (maxAnimatedGifWidth / orientedWidth)
      : 1

    const attempts = (animated && format === 'gif')
      ? [
          { scale: gifStartScale, quality: 75 },
          { scale: gifStartScale * 0.8, quality: 75 },
          { scale: gifStartScale * 0.65, quality: 75 },
          { scale: gifStartScale * 0.5, quality: 75 },
          { scale: gifStartScale * 0.35, quality: 75 },
          { scale: gifStartScale * 0.2, quality: 75 },
        ]
      : [
          { scale: 1, quality: 90 },
          ...(format === 'jpg'
            ? [{ scale: 1, quality: 80 }, { scale: 1, quality: 70 }]
            : []),
          { scale: 0.8, quality: 75 },
          { scale: 0.6, quality: 75 },
          { scale: 0.4, quality: 75 },
          { scale: 0.25, quality: 75 },
          { scale: 0.15, quality: 75 },
          { scale: 0.1, quality: 75 },
        ]

    for (const { scale, quality } of attempts) {
      const remainingSeconds = Math.floor((deadline - Date.now()) / 1000)
      if (remainingSeconds < 1) {
        break
      }
      let pipeline = sharp(bytes, { animated, limitInputPixels: maxAnimatedTotalPixels })
      if (!animated) {
        pipeline = pipeline.rotate()
      }
      const maxDimension = 65500
      pipeline = pipeline.resize({
        width: Math.min(maxDimension, Math.max(1, Math.floor(orientedWidth * scale))),
        height: Math.min(maxDimension, Math.max(1, Math.floor(orientedHeight * scale))),
        fit: 'inside',
        withoutEnlargement: true,
      })
      if (format === 'gif') {
        pipeline = pipeline.gif({ effort: 3, loop: metadata.loop, delay: metadata.delay })
      }
      else if (format === 'png') {
        // PNG 使用无损压缩，尺寸不足时再缩图，保留完整透明通道。
        pipeline = pipeline.png({ compressionLevel: 6 })
      }
      else {
        pipeline = pipeline.jpeg({ quality, chromaSubsampling: '4:4:4' })
      }
      const attemptTimeoutSeconds = animated
        ? Math.min(25, remainingSeconds)
        : Math.min(10, remainingSeconds)
      const output = await pipeline.timeout({ seconds: Math.max(1, attemptTimeoutSeconds) }).toBuffer()
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
