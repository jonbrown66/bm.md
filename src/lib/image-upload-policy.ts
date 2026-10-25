/** 最终图片控制在 4MiB，低于微信 5MB，也为 Vercel 的 4.5MB 请求上限留出余量。 */
export const MAX_UPLOAD_IMAGE_BYTES = 4 * 1024 * 1024
export const MAX_UPLOAD_REQUEST_BYTES = MAX_UPLOAD_IMAGE_BYTES + 64 * 1024
export const UPLOAD_PART_BYTES = 2 * 1024 * 1024
export const MAX_REMOTE_IMAGE_COUNT = 30
export const REMOTE_UPLOAD_BATCH_SIZE = 6
export const MAX_SOURCE_IMAGE_BYTES = 50 * 1024 * 1024
export const SOURCE_IMAGE_SIZE_ERROR = '原始图片不能超过 50MB，请先缩小图片'
export const MAX_IMAGE_FRAME_PIXELS = 40_000_000
export const MAX_ANIMATED_IMAGE_PIXELS = 120_000_000
export const IMAGE_PROCESSING_TIMEOUT_MS = 90_000
export const GIF_WORKING_MEMORY_BYTES = 256 * 1024 * 1024
export const MAX_GIF_OUTPUT_PIXELS = 1_000_000
export const GIF_COMPRESSION_PROFILES = [
  { width: 900, fps: 15, colors: 256 },
  { width: 720, fps: 10, colors: 128 },
  { width: 480, fps: 6, colors: 64 },
  { width: 320, fps: 3, colors: 32 },
] as const

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
