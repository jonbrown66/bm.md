import type { ImageUploadTarget } from '@/lib/image-upload-policy'
import type { UploadOptions, UploadResult } from '@/storage'
import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod'
import { detectImageContentType, getImageFilename } from '@/lib/image-content'
import { ImageProcessingError, readLimitedBody } from '@/lib/image-upload-policy'
import { corsMiddleware } from '@/lib/middleware/cors'
import { prepareUploadImage, uploadPreparedWechatImage } from '@/lib/prepare-upload-image.server'
import { getStorageProvider, StorageError } from '@/storage'

const maxImageCount = 30

const remoteImagesSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(maxImageCount),
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

async function downloadRemoteImage(oldUrl: string, target: ImageUploadTarget): Promise<DownloadedRemoteImage | RemoteImageResult> {
  try {
    if (!isHttpUrl(oldUrl)) {
      return { oldUrl, status: 'failed', error: '只支持 http/https 图片链接' }
    }

    const response = await fetch(oldUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: 'image/*',
      },
    })

    if (!response.ok) {
      return { oldUrl, status: 'failed', error: `下载失败: ${response.status}` }
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
    const prepared = await prepareUploadImage(original, target)
    if (target === 'wechat' && prepared === original) {
      return { oldUrl, newUrl: oldUrl, status: 'success' }
    }

    return {
      oldUrl,
      uploadOptions: prepared,
    }
  }
  catch (error) {
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

async function uploadDownloadedImages(images: DownloadedRemoteImage[], target: ImageUploadTarget): Promise<RemoteImageResult[]> {
  if (images.length === 0) {
    return []
  }

  try {
    const storage = getStorageProvider()
    if (target === 'wechat') {
      const results = await Promise.allSettled(images.map(image => uploadPreparedWechatImage(image.uploadOptions, storage)))
      return images.map((image, index): RemoteImageResult => {
        const result = results[index]
        if (result.status === 'fulfilled') {
          return { oldUrl: image.oldUrl, newUrl: result.value.url, status: 'success' }
        }
        const error: unknown = result.reason
        const message = error instanceof StorageError || error instanceof ImageProcessingError
          ? error.message
          : '图片上传到存储失败'
        console.error('Wechat image upload error:', message)
        return { oldUrl: image.oldUrl, status: 'failed', error: message }
      })
    }
    const uploadResults: UploadResult[] = storage.uploadMany
      ? await storage.uploadMany(images.map(image => image.uploadOptions))
      : await Promise.all(images.map(image => storage.upload(image.uploadOptions)))

    return images.map((image, index) => ({
      oldUrl: image.oldUrl,
      newUrl: uploadResults[index]?.url,
      status: uploadResults[index]?.url ? 'success' : 'failed',
      error: uploadResults[index]?.url ? undefined : '存储服务未返回图片链接',
    }))
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

async function migrateRemoteImages(urls: string[], target: ImageUploadTarget): Promise<RemoteImageResult[]> {
  const results: RemoteImageResult[] = []
  // 分批下载、压缩、上传，避免同时持有 30 张大图及其 Base64 副本。
  for (let index = 0; index < urls.length; index += 2) {
    const downloadedResults = await Promise.all(urls.slice(index, index + 2).map(url => downloadRemoteImage(url, target)))
    const completedDownloads = downloadedResults.filter(isRemoteImageResult)
    const downloadedImages = downloadedResults.filter(
      (result): result is DownloadedRemoteImage => !isRemoteImageResult(result),
    )
    results.push(...completedDownloads, ...await uploadDownloadedImages(downloadedImages, target))
  }
  return results
}

export const Route = createFileRoute('/api/upload/remote-images')({
  server: {
    middleware: [corsMiddleware],
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const parsed = remoteImagesSchema.parse(body)
          const urls = Array.from(new Set(parsed.urls))

          const results = await migrateRemoteImages(urls, parsed.target)

          return Response.json({ results })
        }
        catch (error) {
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
