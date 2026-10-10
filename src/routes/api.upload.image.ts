import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod'
import { ImageProcessingError, MAX_SOURCE_IMAGE_BYTES, readLimitedBody } from '@/lib/image-upload-policy'
import { corsMiddleware } from '@/lib/middleware/cors'
import { prepareUploadImage, uploadPreparedWechatImage } from '@/lib/prepare-upload-image.server'
import { getStorageProvider, StorageError } from '@/storage'
import { getPublicStorageErrorMessage } from '@/storage/errors'

const uploadSchema = z.object({
  name: z.string().min(1),
  file: z.instanceof(Blob),
  target: z.enum(['default', 'wechat']).default('default'),
})

export const Route = createFileRoute('/api/upload/image')({
  server: {
    middleware: [corsMiddleware],
    handlers: {
      POST: async ({ request }) => {
        try {
          // 1. 解析 FormData
          // 为 multipart 字段预留 1MB，同时对无 Content-Length 的请求限流。
          const body = await readLimitedBody(request, MAX_SOURCE_IMAGE_BYTES + 1024 * 1024, '上传请求不能超过 51MB，原始图片上限为 50MB')
          const formData = await new Response(body, { headers: request.headers }).formData()
          const file = formData.get('file')
          const name = formData.get('name')

          // 2. 校验输入
          const parsed = uploadSchema.parse({ file, name, target: formData.get('target') ?? undefined })
          const { file: imageFile, name: imageName } = parsed

          // 3. 校验文件类型和大小
          if (!imageFile.type.startsWith('image/')) {
            return Response.json(
              { error: '只支持上传图片文件' },
              { status: 400 },
            )
          }

          // 4. 普通上传上限 10MB，公众号复制上限 5MB，通过处理后再上传。
          const uploadOptions = await prepareUploadImage({
            file: imageFile,
            filename: imageName,
            contentType: imageFile.type,
          }, parsed.target)
          const storage = getStorageProvider()
          const result = parsed.target === 'wechat'
            ? await uploadPreparedWechatImage(uploadOptions, storage)
            : await storage.upload(uploadOptions)

          // 5. 返回成功响应
          return Response.json({ url: result.url })
        }
        catch (error) {
          if (error instanceof ImageProcessingError) {
            return Response.json({ error: error.message }, { status: error.status })
          }
          // 处理存储错误（包含 provider 标识）
          if (error instanceof StorageError) {
            console.error(`Upload error [${error.provider}]:`, error.message, error.cause)
            return Response.json(
              { error: getPublicStorageErrorMessage(error) },
              { status: 500 },
            )
          }

          console.error('Upload error:', error)

          // 处理 Zod 验证错误
          if (error && typeof error === 'object' && 'issues' in error) {
            return Response.json(
              { error: '请求参数错误' },
              { status: 400 },
            )
          }

          // 其他错误
          return Response.json(
            { error: '图片上传失败，请稍后重试' },
            { status: 500 },
          )
        }
      },
    },
  },
})
