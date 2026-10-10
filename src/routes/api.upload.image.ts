import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod'
import { assembleImageParts, partMetadataSchema, stageImagePart, uploadManifestSchema } from '@/lib/image-upload-parts.server'
import { ImageProcessingError, MAX_UPLOAD_REQUEST_BYTES, readLimitedBody } from '@/lib/image-upload-policy'
import { corsMiddleware } from '@/lib/middleware/cors'
import { prepareUploadImage, uploadPreparedImage } from '@/lib/prepare-upload-image.server'
import { getStorageProvider, StorageError } from '@/storage'
import { getPublicStorageErrorMessage } from '@/storage/errors'

const uploadSchema = z.object({
  name: z.string().min(1).max(200),
  file: z.instanceof(Blob),
})

export const Route = createFileRoute('/api/upload/image')({
  server: {
    middleware: [corsMiddleware],
    handlers: {
      POST: async ({ request }) => {
        try {
          const storage = getStorageProvider(AbortSignal.timeout(240_000))
          const body = await readLimitedBody(request, MAX_UPLOAD_REQUEST_BYTES, '上传请求过大，请刷新页面后使用分片上传')
          let file: FormDataEntryValue | Blob | null
          let name: FormDataEntryValue | string | null
          if (request.headers.get('content-type')?.includes('application/json')) {
            const manifest = uploadManifestSchema.parse(JSON.parse(new TextDecoder().decode(body)))
            file = new Blob([await assembleImageParts(manifest.parts, storage)], { type: manifest.contentType })
            name = manifest.name
          }
          else {
            const formData = await new Response(body, { headers: request.headers }).formData()
            file = formData.get('file')
            name = formData.get('name')
            if (formData.get('action') === 'part') {
              const metadata = partMetadataSchema.parse(JSON.parse(String(formData.get('metadata'))))
              if (!(file instanceof Blob)) {
                return Response.json({ error: '图片分片缺失' }, { status: 400 })
              }
              const receipt = await stageImagePart(file, metadata, storage)
              return Response.json({ receipt })
            }
          }

          // 2. 校验输入
          const parsed = uploadSchema.parse({ file, name })
          const { file: imageFile, name: imageName } = parsed

          // 3. 校验文件类型和大小
          if (!imageFile.type.startsWith('image/')) {
            return Response.json(
              { error: '只支持上传图片文件' },
              { status: 400 },
            )
          }

          // 所有来源均先处理为小于 5MB 的兼容图片，再提交图床。
          const uploadOptions = await prepareUploadImage({
            file: imageFile,
            filename: imageName,
            contentType: imageFile.type,
          })
          const result = await uploadPreparedImage(uploadOptions, storage)

          // 5. 返回成功响应
          return Response.json({ url: result.url })
        }
        catch (error) {
          if (error instanceof ImageProcessingError) {
            return Response.json({ error: error.message }, { status: error.status })
          }
          if (error instanceof SyntaxError || error instanceof TypeError) {
            return Response.json({ error: '请求数据格式错误' }, { status: 400 })
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
