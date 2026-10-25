import { randomBytes } from 'node:crypto'
import { GIFEncoder } from 'gifenc'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { MAX_SOURCE_IMAGE_BYTES, MAX_UPLOAD_IMAGE_BYTES } from './image-upload-policy'
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
  it.each([2 * 1024 * 1024, MAX_UPLOAD_IMAGE_BYTES])('preserves compatible images at %i bytes', async (size) => {
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'red' } }).png().toBuffer()
    const original = options(pad(png, size))
    expect(await (await prepareUploadImage(original)).file.arrayBuffer()).toEqual(await original.file.arrayBuffer())
  })

  it('compresses a real 5–10MB image during ordinary upload', async () => {
    const png = await sharp(randomBytes(1500 * 1500 * 3), { raw: { width: 1500, height: 1500, channels: 3 } })
      .png({ compressionLevel: 0 })
      .toBuffer()
    const original = options(png)
    expect(original.file.size).toBeGreaterThan(5 * 1024 * 1024)
    expect(original.file.size).toBeLessThan(10 * 1024 * 1024)
    const result = await prepareUploadImage(original)
    expect(result.file.size).toBeLessThanOrEqual(MAX_UPLOAD_IMAGE_BYTES)
    expect(result.contentType).toBe('image/jpeg')
    expect(await sharp(await result.file.arrayBuffer()).metadata()).toMatchObject({ width: 1500, height: 1500 })
  }, 30_000)

  it('outputs PNG for a transparent WeChat image without flattening alpha', async () => {
    const png = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } })
      .png()
      .toBuffer()
    const result = await prepareUploadImage(options(pad(png)))
    expect(result.contentType).toBe('image/png')
    expect(result.file.size).toBeLessThanOrEqual(MAX_UPLOAD_IMAGE_BYTES)
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
    const result = await prepareUploadImage(options(webp, 'image/webp', 'animation.webp'))
    expect(result.contentType).toBe('image/gif')
    expect(result.filename).toBe('animation.gif')
    expect(await sharp(await result.file.arrayBuffer(), { animated: true }).metadata())
      .toMatchObject({ pages: 2, delay: [100, 200], loop: 2 })
  })
  it('rejects unsupported small resources instead of trusting their declared image type', async () => {
    await expect(prepareUploadImage(options(new Uint8Array(10)))).rejects.toThrow('暂不支持')
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
    expect((await sharp(await result.file.arrayBuffer()).metadata()).width).toBeLessThanOrEqual(2048)
  }, 30_000)

  it('preserves transparency in a compressed image', async () => {
    const png = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } })
      .png()
      .toBuffer()
    const result = await prepareUploadImage(options(pad(png)))
    expect(result.contentType).toBe('image/png')
    expect(result.filename).toBe('test.png')
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

  it('preserves a real multi-frame animation with more than 40M total pixels', async () => {
    const frames = 410
    const frameSize = 320 * 320 * 3
    const raw = new Uint8Array(frameSize * frames)
    for (let frame = 0; frame < frames; frame++) {
      for (let pixel = frame * frameSize; pixel < (frame + 1) * frameSize; pixel += 3) {
        raw[pixel] = frame % 2 ? 255 : 0
        raw[pixel + 1] = frame % 2 ? 0 : 255
      }
    }
    const gif = await sharp(raw, { raw: { width: 320, height: 320 * frames, channels: 3, pageHeight: 320 } })
      .gif({ delay: Array.from({ length: frames }, () => 30), loop: 2, effort: 1 })
      .toBuffer()
    expect((await sharp(gif, { animated: true }).metadata()).pages).toBe(frames)
    const result = await prepareUploadImage(options(pad(gif), 'image/gif', 'anim.gif'))
    expect(result.contentType).toBe('image/gif')
    expect(await sharp(await result.file.arrayBuffer(), { animated: true }).metadata()).toMatchObject({ pages: frames, loop: 2 })
  }, 60_000)

  it('passes through a compatible GIF above 120M total pixels without decoding all frames', async () => {
    const encoder = GIFEncoder()
    const index = new Uint8Array(640 * 480)
    for (let frame = 0; frame < 400; frame++) {
      index.fill(frame % 2)
      encoder.writeFrame(index, 640, 480, { palette: [[255, 255, 255], [0, 0, 0]], delay: 30, repeat: 2 })
    }
    encoder.finish()
    const original = options(encoder.bytes(), 'image/gif', 'compatible.gif')
    expect(await (await prepareUploadImage(original)).file.arrayBuffer()).toEqual(await original.file.arrayBuffer())
  })

  it('automatically compresses an animation above 120M total pixels instead of rejecting it', async () => {
    const width = 640
    const height = 480
    const frames = 400
    const encoder = GIFEncoder()
    const index = new Uint8Array(width * height)
    const palette = Array.from({ length: 64 }, (_, color) => [
      (color & 3) * 85,
      ((color >> 2) & 3) * 85,
      ((color >> 4) & 3) * 85,
    ])
    let state = 12345
    for (let frame = 0; frame < frames; frame++) {
      index.fill(63)
      for (let y = 0; y < 140; y++) {
        for (let x = 0; x < 140; x++) {
          state = (Math.imul(state, 1664525) + 1013904223) >>> 0
          index[(100 + y) * width + 100 + x] = state >>> 26
        }
      }
      encoder.writeFrame(index, width, height, { palette, delay: 30, repeat: 2 })
    }
    encoder.finish()
    const gif = encoder.bytes()
    expect(width * height * frames).toBeGreaterThan(120_000_000)
    expect(gif.byteLength).toBeGreaterThan(MAX_UPLOAD_IMAGE_BYTES)
    const metadata = await sharp(gif).metadata()
    const startedAt = performance.now()
    const result = await prepareUploadImage(options(gif, 'image/gif', 'whiteboard-demo.gif'))
    const output = await sharp(await result.file.arrayBuffer()).metadata()
    expect(result.contentType).toBe('image/gif')
    expect(result.filename).toBe('whiteboard-demo.gif')
    expect(result.file.size).toBeLessThanOrEqual(MAX_UPLOAD_IMAGE_BYTES)
    expect(output.pages).toBeGreaterThan(1)
    expect(output.pages).toBeLessThan(frames)
    expect(output.loop).toBe(metadata.loop)
    expect(output.delay?.reduce((total, delay) => total + delay, 0)).toBe(frames * 30)
    console.info(`120M+ GIF: ${frames} frames -> ${output.pages} frames, ${result.file.size} bytes, ${Math.round(performance.now() - startedAt)}ms`)
  }, 90_000)

  it('compresses a real noisy GIF larger than 5MB while retaining its animation', async () => {
    const frames = 128
    const data = randomBytes(256 * 256 * frames * 3)
    const gif = await sharp(data, { raw: { width: 256, height: 256 * frames, channels: 3, pageHeight: 256 } })
      .gif({ delay: Array.from({ length: frames }, () => 40), loop: 2, effort: 1 })
      .toBuffer()
    expect(gif.byteLength).toBeGreaterThan(5 * 1024 * 1024)
    const original = options(gif, 'image/gif', 'oversized.gif')
    const result = await prepareUploadImage(original)
    expect(result.file.size).toBeLessThanOrEqual(MAX_UPLOAD_IMAGE_BYTES)
    expect(result.contentType).toBe('image/gif')
    expect(await sharp(await result.file.arrayBuffer(), { animated: true }).metadata()).toMatchObject({ pages: frames, loop: 2, delay: Array.from({ length: frames }, () => 40) })
  }, 60_000)
})
