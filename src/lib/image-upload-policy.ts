export const MAX_UPLOAD_IMAGE_BYTES = 10 * 1024 * 1024
/** 公众号复制使用独立的 5MB 上限。 */
export const MAX_WECHAT_IMAGE_BYTES = 5 * 1024 * 1024
export type ImageUploadTarget = 'default' | 'wechat'
export const MAX_SOURCE_IMAGE_BYTES = 50 * 1024 * 1024
export const SOURCE_IMAGE_SIZE_ERROR = '原始图片不能超过 50MB，请先缩小图片'

export class ImageProcessingError extends Error {
  constructor(message: string, public readonly status = 422) {
    super(message)
  }
}

/** 同时检查声明大小与实际流量，避免无 Content-Length 时无限缓冲。 */
export async function readLimitedBody(
  response: Pick<Response, 'headers' | 'body'>,
  limit = MAX_SOURCE_IMAGE_BYTES,
  message = SOURCE_IMAGE_SIZE_ERROR,
): Promise<ArrayBuffer> {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel()
    throw new ImageProcessingError(message, 413)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    return new ArrayBuffer(0)
  }

  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      size += value.byteLength
      if (size > limit) {
        await reader.cancel()
        throw new ImageProcessingError(message, 413)
      }
      chunks.push(value)
    }
  }
  finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes.buffer
}
