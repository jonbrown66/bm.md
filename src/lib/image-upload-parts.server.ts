import type { StorageProvider } from '@/storage/types'
import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { env } from '@/env'
import { ImageProcessingError, MAX_SOURCE_IMAGE_BYTES, MAX_UPLOAD_IMAGE_BYTES, UPLOAD_PART_BYTES } from './image-upload-policy'

const receiptSchema = z.object({
  id: z.string().uuid(),
  index: z.number().int().min(0).max(Math.ceil(MAX_SOURCE_IMAGE_BYTES / UPLOAD_PART_BYTES) - 1),
  totalSize: z.number().int().min(MAX_UPLOAD_IMAGE_BYTES + 1).max(MAX_SOURCE_IMAGE_BYTES),
  size: z.number().int().min(1).max(UPLOAD_PART_BYTES),
  sha: z.string().regex(/^[a-f0-9]{40}$/),
  expiresAt: z.number().int(),
})

export const partMetadataSchema = receiptSchema.pick({ id: true, index: true, totalSize: true })
export const uploadManifestSchema = z.object({
  name: z.string().min(1).max(200),
  contentType: z.string().startsWith('image/').max(100),
  parts: z.array(z.string().min(1).max(1024)).min(3).max(Math.ceil(MAX_SOURCE_IMAGE_BYTES / UPLOAD_PART_BYTES)),
})

function signature(payload: string, storage: StorageProvider): Buffer {
  const secret = env.GITHUB_IMAGE_TOKEN
  if (!secret || !storage.cacheScope) {
    throw new ImageProcessingError('大文件上传需要配置 GitHub 图床', 503)
  }
  return createHmac('sha256', secret).update(`bm.md.image-part.v1:${storage.cacheScope}:${payload}`).digest()
}

/** 分片只创建 Git blob，不生成原图文件或分支提交；浏览器只拿到有时效的签名凭据。 */
export async function stageImagePart(file: Blob, metadata: z.infer<typeof partMetadataSchema>, storage: StorageProvider): Promise<string> {
  const expectedSize = Math.min(UPLOAD_PART_BYTES, metadata.totalSize - metadata.index * UPLOAD_PART_BYTES)
  if (file.size !== expectedSize || expectedSize < 1 || !storage.createUploadBlob) {
    throw new ImageProcessingError('图片分片大小或上传配置无效', 400)
  }
  // 先检查签名配置，避免创建无法继续上传的分片。
  signature('', storage)
  const sha = await storage.createUploadBlob(new Uint8Array(await file.arrayBuffer()))
  const receipt = receiptSchema.parse({ ...metadata, size: file.size, sha, expiresAt: Date.now() + 20 * 60 * 1000 })
  const payload = Buffer.from(JSON.stringify(receipt)).toString('base64url')
  return `${payload}.${signature(payload, storage).toString('hex')}`
}

export async function assembleImageParts(tokens: string[], storage: StorageProvider): Promise<Blob> {
  const receipts = tokens.map((token) => {
    const [payload, mac, extra] = token.split('.')
    if (!payload || !mac || extra || !/^[a-f0-9]{64}$/.test(mac)) {
      throw new ImageProcessingError('图片分片凭据无效，请重新上传', 400)
    }
    if (!timingSafeEqual(signature(payload, storage), Buffer.from(mac, 'hex'))) {
      throw new ImageProcessingError('图片分片校验失败，请重新上传', 400)
    }
    const receipt = receiptSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')))
    if (receipt.expiresAt < Date.now()) {
      throw new ImageProcessingError('图片分片已过期，请重新上传', 400)
    }
    return receipt
  })
  const first = receipts[0]
  if (!first || receipts.length !== Math.ceil(first.totalSize / UPLOAD_PART_BYTES) || !storage.readUploadBlob) {
    throw new ImageProcessingError('图片分片不完整，请重新上传', 400)
  }
  if (receipts.some((part, index) => part.id !== first.id || part.totalSize !== first.totalSize || part.index !== index
    || part.size !== Math.min(UPLOAD_PART_BYTES, first.totalSize - index * UPLOAD_PART_BYTES))) {
    throw new ImageProcessingError('图片分片顺序或大小不一致，请重新上传', 400)
  }
  const bytes = new Uint8Array(first.totalSize)
  // 小分片逐个读取，避免同时持有所有 Base64 响应。
  for (const part of receipts) {
    const chunk = await storage.readUploadBlob(part.sha)
    if (chunk.byteLength !== part.size) {
      throw new ImageProcessingError('图片分片内容不完整，请重新上传', 400)
    }
    bytes.set(new Uint8Array(chunk), part.index * UPLOAD_PART_BYTES)
  }
  return new Blob([bytes])
}
