import { createFileRoute } from '@tanstack/react-router'
import { detectImageContentType } from '@/lib/image-content'
import { corsMiddleware } from '@/lib/middleware/cors'

const _1MB = 1024 * 1024
const maxFileSize = 8

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

          const contentLength = Number(response.headers.get('content-length') || 0)
          if (contentLength > maxFileSize * _1MB) {
            return Response.json(
              { error: `图片大小不能超过 ${maxFileSize}MB` },
              { status: 413 },
            )
          }

          const buffer = await response.arrayBuffer()
          if (buffer.byteLength > maxFileSize * _1MB) {
            return Response.json(
              { error: `图片大小不能超过 ${maxFileSize}MB` },
              { status: 413 },
            )
          }

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
