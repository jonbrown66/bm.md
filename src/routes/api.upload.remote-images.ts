import type { UploadOptions, UploadResult } from '@/storage'
import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod'
import { detectImageContentType, getImageFilename } from '@/lib/image-content'
import { corsMiddleware } from '@/lib/middleware/cors'
import { getStorageProvider, StorageError } from '@/storage'

const _1MB = 1024 * 1024
const maxFileSize = 5
const maxImageCount = 30

const remoteImagesSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(maxImageCount),
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

async function downloadRemoteImage(oldUrl: string): Promise<DownloadedRemoteImage | RemoteImageResult> {
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

    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > maxFileSize * _1MB) {
      return { oldUrl, status: 'failed', error: `图片大小不能超过 ${maxFileSize}MB` }
    }

    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > maxFileSize * _1MB) {
      return { oldUrl, status: 'failed', error: `图片大小不能超过 ${maxFileSize}MB` }
    }

    const headerContentType = response.headers.get('content-type')?.split(';').at(0)?.trim() || ''
    const detectedContentType = headerContentType.startsWith('image/')
      ? headerContentType
      : detectImageContentType(new Uint8Array(buffer))

    if (!detectedContentType) {
      return { oldUrl, status: 'failed', error: '远程资源不是图片' }
    }

    const filename = getImageFilename(oldUrl, detectedContentType)
    const file = new Blob([buffer], { type: detectedContentType })

    return {
      oldUrl,
      uploadOptions: {
        file,
        filename,
        contentType: detectedContentType,
      },
    }
  }
  catch (error) {
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

async function uploadDownloadedImages(images: DownloadedRemoteImage[]): Promise<RemoteImageResult[]> {
  if (images.length === 0) {
    return []
  }

  const storage = getStorageProvider()

  try {
    const uploadResults: UploadResult[] = storage.uploadMany
      ? await storage.uploadMany(images.map(image => image.uploadOptions))
      : await Promise.all(images.map(image => storage.upload(image.uploadOptions)))

    return images.map((image, index) => ({
      oldUrl: image.oldUrl,
      newUrl: uploadResults[index]?.url,
      status: 'success',
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

async function migrateRemoteImages(urls: string[]): Promise<RemoteImageResult[]> {
  const downloadedResults = await Promise.all(urls.map(downloadRemoteImage))
  const failedDownloads = downloadedResults.filter(isRemoteImageResult)
  const downloadedImages = downloadedResults.filter(
    (result): result is DownloadedRemoteImage => !isRemoteImageResult(result),
  )
  const uploadedResults = await uploadDownloadedImages(downloadedImages)

  return [...failedDownloads, ...uploadedResults]
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

          const results = await migrateRemoteImages(urls)

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
