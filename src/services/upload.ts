import { apiFetch } from '@/lib/api'
import { MAX_SOURCE_IMAGE_BYTES, MAX_UPLOAD_IMAGE_BYTES, SOURCE_IMAGE_SIZE_ERROR, UPLOAD_PART_BYTES } from '@/lib/image-upload-policy'

const MAX_CONCURRENT_PART_UPLOADS = 3

export interface UploadImageResponse {
  url: string
}

export interface UploadRemoteImageResult {
  oldUrl: string
  newUrl?: string
  status: 'success' | 'failed'
  error?: string
}

export interface UploadRemoteImagesResponse {
  results: UploadRemoteImageResult[]
}

export async function uploadImage(formData: FormData): Promise<UploadImageResponse> {
  try {
    const file = formData.get('file')
    if (file instanceof Blob && file.size > MAX_SOURCE_IMAGE_BYTES) {
      throw new Error(SOURCE_IMAGE_SIZE_ERROR)
    }
    if (file instanceof Blob && !file.type.startsWith('image/')) {
      throw new Error('只支持上传图片文件')
    }
    if (!(file instanceof Blob) || file.size <= MAX_UPLOAD_IMAGE_BYTES) {
      return await retryUploadRequest(() => apiFetch<UploadImageResponse>('/api/upload/image', {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(120_000),
      }))
    }
    const id = crypto.randomUUID()
    const partCount = Math.ceil(file.size / UPLOAD_PART_BYTES)
    const parts: string[] = []
    let nextIndex = 0
    let stopped = false
    // 按索引保存凭据；失败后停止领取新片，Promise.all 会接住已发出任务的后续失败。
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_PART_UPLOADS, partCount) }, async () => {
      while (!stopped && nextIndex < partCount) {
        const index = nextIndex++
        try {
          const offset = index * UPLOAD_PART_BYTES
          const part = new FormData()
          part.set('action', 'part')
          part.set('file', file.slice(offset, offset + UPLOAD_PART_BYTES))
          part.set('metadata', JSON.stringify({ id, index, totalSize: file.size }))
          const response = await retryUploadRequest(() => apiFetch<{ receipt: string }>('/api/upload/image', {
            method: 'POST',
            body: part,
            signal: AbortSignal.timeout(60_000),
          }))
          if (!response.receipt) {
            throw new Error('图片分片未返回上传凭据，请重试')
          }
          parts[index] = response.receipt
        }
        catch (error) {
          stopped = true
          throw error
        }
      }
    }))
    return await retryUploadRequest(() => apiFetch<UploadImageResponse>('/api/upload/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: formData.get('name'), contentType: file.type, parts }),
      signal: AbortSignal.timeout(270_000),
    }))
  }
  catch (error) {
    const message = getApiErrorMessage(error)
    throw new Error(message || '图片上传失败')
  }
}

export async function uploadRemoteImages(urls: string[]): Promise<UploadRemoteImagesResponse> {
  try {
    return await retryUploadRequest(() => apiFetch<UploadRemoteImagesResponse>('/api/upload/remote-images', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ urls }),
      signal: AbortSignal.timeout(270_000),
    }))
  }
  catch (error) {
    const message = getApiErrorMessage(error)
    throw new Error(message || '批量上传图片失败')
  }
}

/** 仅对暂时性的网络/服务错误重试，参数错误、认证错误和大小超限立即返回。 */
async function retryUploadRequest<T>(request: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await request()
    }
    catch (error) {
      const status = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined
      if (attempt >= 2 || (typeof status === 'number' && ![408, 429, 500, 502, 503, 504].includes(status))) {
        throw error
      }
      if (!(error instanceof Error) || (!status && !['FetchError', 'TypeError', 'TimeoutError'].includes(error.name))) {
        throw error
      }
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt))
    }
  }
}

function getApiErrorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const data = 'data' in error ? error.data : undefined
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    return data.error
  }

  if ('message' in error && typeof error.message === 'string') {
    return error.message
  }

  return undefined
}
