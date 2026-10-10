import type { StorageProvider, UploadOptions } from '@/storage'
import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod'
import { detectImageContentType, getImageFilename } from '@/lib/image-content'
import { ImageProcessingError, MAX_REMOTE_IMAGE_COUNT, readLimitedBody } from '@/lib/image-upload-policy'
import { corsMiddleware } from '@/lib/middleware/cors'
import { prepareUploadImage, uploadPreparedImages } from '@/lib/prepare-upload-image.server'
import { getStorageProvider, StorageError } from '@/storage'

const remoteImagesSchema = z.object({
  urls: z.array(z.string().url().max(2048)).min(1).max(MAX_REMOTE_IMAGE_COUNT),
  // 兼容已有客户端，但两个值都使用同一上传策略。
  target: z.enum(['default', 'wechat']).default('default'),
})

interface RemoteImageResult {
  oldUrl: string
  newUrl?: string
  status: 'success' | 'failed'
  error?: string
}

interface DownloadedRemoteImage {
  oldUrl: string
  uploadOptions: UploadOptions
}

function isHttpUrl(value: string): boolean {
  const url = new URL(value)
  return url.protocol === 'http:' || url.protocol === 'https:'
}

async function downloadRemoteImage(oldUrl: string, storage: StorageProvider, signal: AbortSignal): Promise<DownloadedRemoteImage | RemoteImageResult> {
  try {
    signal.throwIfAborted()
    if (!isHttpUrl(oldUrl)) {
      return { oldUrl, status: 'failed', error: '只支持 http/https 图片链接' }
    }
    if (storage.isUploadedImageUrl?.(oldUrl)) {
      return { oldUrl, newUrl: oldUrl, status: 'success' }
    }

    let response: Response | undefined
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetch(oldUrl, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
          headers: { Accept: 'image/*' },
        })
        if (attempt === 0 && [429, 500, 502, 503, 504].includes(response.status)) {
          const retryAfter = Number(response.headers.get('retry-after') || 0)
          if (retryAfter > 5)
            break
          await response.body?.cancel()
          await new Promise(resolve => setTimeout(resolve, Math.max(500, retryAfter * 1000)))
          continue
        }
        break
      }
      catch (error) {
        if (attempt > 0 || signal.aborted || !(error instanceof TypeError || (error instanceof DOMException && error.name === 'TimeoutError')))
          throw error
      }
    }

    if (!response?.ok) {
      await response?.body?.cancel()
      return { oldUrl, status: 'failed', error: `下载失败: ${response?.status ?? '请求未完成'}` }
    }

    const buffer = await readLimitedBody(response)

    const headerContentType = response.headers.get('content-type')?.split(';').at(0)?.trim() || ''
    const detectedContentType = headerContentType.startsWith('image/')
      ? headerContentType
      : detectImageContentType(new Uint8Array(buffer))

    if (!detectedContentType) {
      return { oldUrl, status: 'failed', error: '远程资源不是图片' }
    }

    const filename = getImageFilename(oldUrl, detectedContentType)
    const file = new Blob([buffer], { type: detectedContentType })
    const original = { file, filename, contentType: detectedContentType }
    const prepared = await prepareUploadImage(original)

    return {
      oldUrl,
      uploadOptions: prepared,
    }
  }
  catch (error) {
    if (error instanceof StorageError) {
      return { oldUrl, status: 'failed', error: error.message }
    }
    if (error instanceof ImageProcessingError) {
      return { oldUrl, status: 'failed', error: error.message }
    }
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return { oldUrl, status: 'failed', error: '图片下载超时' }
    }

    if (error instanceof TypeError) {
      return { oldUrl, status: 'failed', error: '图片下载失败' }
    }

    console.error('Remote image migrate error:', error)
    return { oldUrl, status: 'failed', error: '图片迁移失败' }
  }
}

function isRemoteImageResult(value: DownloadedRemoteImage | RemoteImageResult): value is RemoteImageResult {
  return 'status' in value
}

async function uploadDownloadedImages(images: DownloadedRemoteImage[], storage: StorageProvider): Promise<RemoteImageResult[]> {
  if (images.length === 0) {
    return []
  }

  try {
    const results = await uploadPreparedImages(images.map(image => image.uploadOptions), storage)
    return images.map((image, index): RemoteImageResult => {
      const result = results[index]
      if (result.status === 'fulfilled') {
        return { oldUrl: image.oldUrl, newUrl: result.value.url, status: 'success' }
      }
      const error: unknown = result.reason
      const message = error instanceof StorageError || error instanceof ImageProcessingError
        ? error.message
        : '图片上传到存储失败'
      console.error('Image upload error:', message)
      return { oldUrl: image.oldUrl, status: 'failed', error: message }
    })
  }
  catch (error) {
    if (error instanceof StorageError) {
      console.error(`Remote image upload error [${error.provider}]:`, error.message, error.cause)
      return images.map(image => ({
        oldUrl: image.oldUrl,
        status: 'failed',
        error: error.message,
      }))
    }

    console.error('Remote image upload error:', error)
    return images.map(image => ({
      oldUrl: image.oldUrl,
      status: 'failed',
      error: '图片上传到存储失败',
    }))
  }
}

async function migrateRemoteImages(urls: string[]): Promise<RemoteImageResult[]> {
  const results: RemoteImageResult[] = []
  const signal = AbortSignal.timeout(240_000)
  const storage = getStorageProvider(signal)
  // 同时只解码两张原图；四张处理后的图片共用一次图床提交。
  for (let index = 0; index < urls.length; index += 4) {
    const downloadedResults: (DownloadedRemoteImage | RemoteImageResult)[] = []
    for (let offset = index; offset < Math.min(index + 4, urls.length); offset += 2) {
      downloadedResults.push(...await Promise.all(urls.slice(offset, Math.min(offset + 2, index + 4)).map(url => downloadRemoteImage(url, storage, signal))))
    }
    const completedDownloads = downloadedResults.filter(isRemoteImageResult)
    const downloadedImages = downloadedResults.filter(
      (result): result is DownloadedRemoteImage => !isRemoteImageResult(result),
    )
    results.push(...completedDownloads, ...await uploadDownloadedImages(downloadedImages, storage))
  }
  return results
}

export const Route = createFileRoute('/api/upload/remote-images')({
  server: {
    middleware: [corsMiddleware],
    handlers: {
      POST: async ({ request }) => {
        try {
          const bytes = await readLimitedBody(request, 128 * 1024, '图片链接请求过大')
          const body: unknown = JSON.parse(new TextDecoder().decode(bytes))
          const parsed = remoteImagesSchema.parse(body)
          const urls = Array.from(new Set(parsed.urls))

          const results = await migrateRemoteImages(urls)

          return Response.json({ results })
        }
        catch (error) {
          if (error instanceof ImageProcessingError) {
            return Response.json({ error: error.message }, { status: error.status })
          }
          if (error instanceof SyntaxError) {
            return Response.json({ error: '请求数据格式错误' }, { status: 400 })
          }
          console.error('Remote images upload error:', error)

          if (error && typeof error === 'object' && 'issues' in error) {
            return Response.json(
              { error: '请求参数错误' },
              { status: 400 },
            )
          }

          return Response.json(
            { error: '批量上传图片失败，请稍后重试' },
            { status: 500 },
          )
        }
      },
    },
  },
})
