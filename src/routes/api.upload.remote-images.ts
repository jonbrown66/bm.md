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

function isHttpUrl(value: string): boolean {
  const url = new URL(value)
  return url.protocol === 'http:' || url.protocol === 'https:'
}

async function migrateRemoteImage(oldUrl: string): Promise<RemoteImageResult> {
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
    const storage = getStorageProvider()
    const result = await storage.upload({
      file,
      filename,
      contentType: detectedContentType,
    })

    return { oldUrl, newUrl: result.url, status: 'success' }
  }
  catch (error) {
    if (error instanceof StorageError) {
      console.error(`Remote image upload error [${error.provider}]:`, error.message, error.cause)
      return { oldUrl, status: 'failed', error: '图片上传到存储失败' }
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

export const Route = createFileRoute('/api/upload/remote-images')({
  server: {
    middleware: [corsMiddleware],
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const parsed = remoteImagesSchema.parse(body)
          const urls = Array.from(new Set(parsed.urls))

          const results = await Promise.all(urls.map(migrateRemoteImage))

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
