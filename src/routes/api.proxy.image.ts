import { createFileRoute } from '@tanstack/react-router'
import { detectImageContentType } from '@/lib/image-content'
import { ImageProcessingError, MAX_UPLOAD_IMAGE_BYTES, readLimitedBody } from '@/lib/image-upload-policy'
import { corsMiddleware } from '@/lib/middleware/cors'

function isHttpUrl(value: string) {
  const url = new URL(value)
  return url.protocol === 'http:' || url.protocol === 'https:'
}

export const Route = createFileRoute('/api/proxy/image')({
  server: {
    middleware: [corsMiddleware],
    handlers: {
      GET: async ({ request }) => {
        try {
          const requestUrl = new URL(request.url)
          const rawUrl = requestUrl.searchParams.get('url')
          if (!rawUrl || !isHttpUrl(rawUrl)) {
            return Response.json(
              { error: '只支持 http/https 图片链接' },
              { status: 400 },
            )
          }

          const response = await fetch(rawUrl, {
            headers: { Accept: 'image/*' },
            signal: AbortSignal.timeout(15_000),
          })

          if (!response.ok) {
            return Response.json(
              { error: `图片下载失败: ${response.status}` },
              { status: 502 },
            )
          }

          const buffer = await readLimitedBody(response, MAX_UPLOAD_IMAGE_BYTES, '图片超过代理上限，请先使用一键上传压缩至 5MB 以下')

          const headerContentType = response.headers.get('content-type')?.split(';').at(0)?.trim() || ''
          const contentType = headerContentType.startsWith('image/')
            ? headerContentType
            : detectImageContentType(new Uint8Array(buffer))

          if (!contentType) {
            return Response.json(
              { error: '远程资源不是图片' },
              { status: 415 },
            )
          }

          return new Response(buffer, {
            headers: {
              'Cache-Control': 'public, max-age=86400',
              'Content-Type': contentType,
            },
          })
        }
        catch (error) {
          if (error instanceof ImageProcessingError) {
            return Response.json({ error: error.message }, { status: error.status })
          }
          console.error('Image proxy error:', error)
          return Response.json(
            { error: '图片代理失败' },
            { status: 500 },
          )
        }
      },
    },
  },
})
