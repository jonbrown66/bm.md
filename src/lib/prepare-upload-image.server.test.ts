import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { MAX_SOURCE_IMAGE_BYTES, MAX_UPLOAD_IMAGE_BYTES, MAX_WECHAT_IMAGE_BYTES } from './image-upload-policy'
import { prepareUploadImage } from './prepare-upload-image.server'

function options(bytes: Uint8Array, type = 'image/png', filename = 'test.png') {
  return { file: new Blob([new Uint8Array(bytes)], { type }), contentType: type, filename }
}

function pad(bytes: Uint8Array, size = MAX_UPLOAD_IMAGE_BYTES + 1) {
  const output = new Uint8Array(size)
  output.set(bytes)
  return output
}

describe('image upload preparation', () => {
  it.each([2 * 1024 * 1024, MAX_WECHAT_IMAGE_BYTES])('preserves compatible WeChat images at %i bytes', async (size) => {
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'red' } }).png().toBuffer()
    const original = options(pad(png, size))
    expect(await prepareUploadImage(original, 'wechat')).toBe(original)
  })

  it('compresses a 5–10MB image for WeChat while retaining it for general upload', async () => {
    const png = await sharp(randomBytes(1500 * 1500 * 3), { raw: { width: 1500, height: 1500, channels: 3 } })
      .png({ compressionLevel: 0 })
      .toBuffer()
    const original = options(png)
    expect(original.file.size).toBeGreaterThan(MAX_WECHAT_IMAGE_BYTES)
    expect(original.file.size).toBeLessThan(MAX_UPLOAD_IMAGE_BYTES)
    expect(await prepareUploadImage(original)).toBe(original)
    const result = await prepareUploadImage(original, 'wechat')
    expect(result.file.size).toBeLessThanOrEqual(MAX_WECHAT_IMAGE_BYTES)
    expect(result.contentType).toBe('image/jpeg')
    expect(await sharp(await result.file.arrayBuffer()).metadata()).toMatchObject({ width: 1500, height: 1500 })
  }, 30_000)

  it('outputs PNG for a transparent WeChat image without flattening alpha', async () => {
    const png = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } })
      .png()
      .toBuffer()
    const result = await prepareUploadImage(options(pad(png, MAX_WECHAT_IMAGE_BYTES + 1)), 'wechat')
    expect(result.contentType).toBe('image/png')
    expect(result.file.size).toBeLessThanOrEqual(MAX_WECHAT_IMAGE_BYTES)
    const { data, info } = await sharp(await result.file.arrayBuffer()).raw().toBuffer({ resolveWithObject: true })
    expect(info.channels).toBe(4)
    expect(data[3]).toBe(128)
  })

  it('converts animated WebP to GIF for WeChat with frames and timing intact', async () => {
    const data = new Uint8Array(24)
    data.fill(255, 0, 12)
    const webp = await sharp(data, { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } })
      .webp({ delay: [100, 200], loop: 2 })
      .toBuffer()
    const result = await prepareUploadImage(options(webp, 'image/webp', 'animation.webp'), 'wechat')
    expect(result.contentType).toBe('image/gif')
    expect(result.filename).toBe('animation.gif')
    expect(await sharp(await result.file.arrayBuffer(), { animated: true }).metadata())
      .toMatchObject({ pages: 2, delay: [100, 200], loop: 2 })
  })
  it.each([5 * 1024 * 1024 + 1, MAX_UPLOAD_IMAGE_BYTES])('preserves original bytes at %i bytes', async (size) => {
    const original = options(new Uint8Array(size))
    expect(await prepareUploadImage(original)).toBe(original)
  })

  it('rejects source files above 50MB before decoding', async () => {
    await expect(prepareUploadImage(options(new Uint8Array(MAX_SOURCE_IMAGE_BYTES + 1))))
      .rejects
      .toMatchObject({ status: 413 })
  })

  it('compresses a real large PNG without shrinking its dimensions', async () => {
    const png = await sharp(randomBytes(2048 * 2048 * 3), { raw: { width: 2048, height: 2048, channels: 3 } })
      .png({ compressionLevel: 0 })
      .toBuffer()
    expect(png.byteLength).toBeGreaterThan(MAX_UPLOAD_IMAGE_BYTES)
    const result = await prepareUploadImage(options(png))
    expect(result.file.size).toBeLessThanOrEqual(MAX_UPLOAD_IMAGE_BYTES)
    expect(result.filename).toBe('test.jpg')
    expect(result.contentType).toBe('image/jpeg')
    expect(await sharp(await result.file.arrayBuffer()).metadata()).toMatchObject({ width: 2048, height: 2048 })
  }, 30_000)

  it('preserves transparency in a compressed image', async () => {
    const png = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } })
      .png()
      .toBuffer()
    const result = await prepareUploadImage(options(pad(png)))
    expect(result.contentType).toBe('image/webp')
    expect(result.filename).toBe('test.webp')
    const { data, info } = await sharp(await result.file.arrayBuffer()).raw().toBuffer({ resolveWithObject: true })
    expect(info.channels).toBe(4)
    expect(data[3]).toBeGreaterThanOrEqual(127)
    expect(data[3]).toBeLessThanOrEqual(128)
  })

  it('retains all GIF frames and timing', async () => {
    const data = new Uint8Array(2 * 2 * 2 * 3)
    data.fill(255, 0, 12)
    const gif = await sharp(data, { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } })
      .gif({ delay: [100, 200], loop: 2 })
      .toBuffer()
    expect((await sharp(gif).metadata()).pages).toBe(2)
    const result = await prepareUploadImage(options(pad(gif), 'image/gif', 'animated.gif'))
    expect(result.file.size).toBeLessThanOrEqual(MAX_UPLOAD_IMAGE_BYTES)
    expect(await sharp(await result.file.arrayBuffer(), { animated: true }).metadata())
      .toMatchObject({ pages: 2, delay: [100, 200], loop: 2 })
  })

  it('rejects APNG instead of silently dropping animation', async () => {
    const bytes = pad(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 8, 97, 99, 84, 76]))
    await expect(prepareUploadImage(options(bytes))).rejects.toThrow('APNG')
  })

  it('reports oversized unsupported formats and corrupt images', async () => {
    await expect(prepareUploadImage(options(pad(new Uint8Array()), 'image/svg+xml'))).rejects.toThrow('暂不支持')
    await expect(prepareUploadImage(options(pad(new Uint8Array([255, 216, 255])), 'image/jpeg'))).rejects.toThrow('压缩失败')
  })

  it('allows animated images with total pixels exceeding 40M while rejecting single frames over 40M', async () => {
    // 450 帧，每帧 320x320 = 102,400 像素，总像素 46,080,000 (> 40M)
    const raw = new Uint8Array(320 * 320 * 3)
    const gif = await sharp(raw, { raw: { width: 320, height: 320, channels: 3 } })
      .gif()
      .toBuffer()
    // 正常小 GIF 不会抛出单帧或动图像素超限错误
    const result = await prepareUploadImage(options(pad(gif), 'image/gif', 'anim.gif'))
    expect(result.contentType).toBe('image/webp')
  })
})
