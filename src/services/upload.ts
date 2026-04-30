import { apiFetch } from '@/lib/api'

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
    return await apiFetch<UploadImageResponse>('/api/upload/image', {
      method: 'POST',
      body: formData,
    })
  }
  catch (error) {
    const message = getApiErrorMessage(error)
    throw new Error(message || '图片上传失败')
  }
}

export async function uploadRemoteImages(urls: string[]): Promise<UploadRemoteImagesResponse> {
  try {
    return await apiFetch<UploadRemoteImagesResponse>('/api/upload/remote-images', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ urls }),
    })
  }
  catch (error) {
    const message = getApiErrorMessage(error)
    throw new Error(message || '批量上传图片失败')
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
