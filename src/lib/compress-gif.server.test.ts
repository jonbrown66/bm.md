import { Buffer } from 'node:buffer'
import { GIFEncoder } from 'gifenc'
import { parseGIF } from 'gifuct-js'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { compressGif } from './compress-gif.server'

const palette = [
  [0, 0, 0],
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
]

interface FixtureFrame {
  pixels: Uint8Array
  delay: number
  width?: number
  height?: number
  left?: number
  top?: number
  dispose?: number
  transparent?: boolean
}

function makeGif(width: number, height: number, frames: FixtureFrame[], repeat = 0, colors = palette): Uint8Array {
  const chunks: Buffer[] = []
  for (const [index, frame] of frames.entries()) {
    const encoder = GIFEncoder()
    encoder.writeFrame(frame.pixels, frame.width ?? width, frame.height ?? height, {
      palette: colors,
      delay: frame.delay,
      repeat: index === 0 ? repeat : -1,
      dispose: frame.dispose ?? 1,
      transparent: frame.transparent ?? false,
      transparentIndex: 0,
    })
    encoder.finish()
    const bytes = Buffer.from(encoder.bytes())
    const colorTableEnd = 13 + 3 * 2 ** ((bytes[10] & 7) + 1)
    const controlOffset = bytes.indexOf(Buffer.from([0x21, 0xF9, 0x04]), colorTableEnd)
    expect(controlOffset).toBeGreaterThanOrEqual(colorTableEnd)
    // GCE 固定占 8 字节，紧随其后的图像描述符包含局部帧的左上偏移。
    const imageOffset = controlOffset + 8
    expect(bytes[imageOffset]).toBe(0x2C)
    bytes.writeUInt16LE(frame.left ?? 0, imageOffset + 1)
    bytes.writeUInt16LE(frame.top ?? 0, imageOffset + 3)
    // 后续帧共用首帧的全局调色板，只拼接 GCE、图像描述符和压缩像素。
    chunks.push(bytes.subarray(index === 0 ? 0 : controlOffset, bytes.length - 1))
  }
  chunks.push(Buffer.from([0x3B]))
  return new Uint8Array(Buffer.concat(chunks))
}

function solidFrame(width: number, height: number, color: number, delay: number): FixtureFrame {
  return { pixels: new Uint8Array(width * height).fill(color), delay }
}

function budget(maxBytes = 1024 * 1024) {
  return { maxBytes, deadline: Date.now() + 30_000 }
}

function totalDelay(delays: number[] = []) {
  return delays.reduce((total, delay) => total + delay, 0)
}

async function readAnimation(bytes: Uint8Array) {
  const [metadata, { data, info }] = await Promise.all([
    sharp(bytes, { animated: true }).metadata(),
    sharp(bytes, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ])
  const height = info.pageHeight ?? info.height
  const frameBytes = info.width * height * 4
  return {
    metadata,
    width: info.width,
    height,
    frames: Array.from({ length: info.height / height }, (_, index) =>
      data.subarray(index * frameBytes, (index + 1) * frameBytes)),
  }
}

function pixelAt(frame: Uint8Array, width: number, x: number, y: number) {
  const offset = (y * width + x) * 4
  return Array.from(frame.subarray(offset, offset + 4))
}

function expectSamePicture(actual: Uint8Array, expected: Uint8Array) {
  expect(actual.length).toBe(expected.length)
  let maxDifference = 0
  for (let offset = 0; offset < expected.length; offset += 4) {
    maxDifference = Math.max(maxDifference, Math.abs(actual[offset + 3] - expected[offset + 3]))
    // 全透明像素的 RGB 不影响显示效果；可见颜色允许 RGB565 量化的舍入误差。
    if (actual[offset + 3] === 0 && expected[offset + 3] === 0) {
      continue
    }
    for (let channel = 0; channel < 3; channel++) {
      maxDifference = Math.max(maxDifference, Math.abs(actual[offset + channel] - expected[offset + channel]))
    }
  }
  expect(maxDifference).toBeLessThanOrEqual(8)
}

function makePatchGif(disposal: number) {
  const width = 10
  const height = 8
  const background = new Uint8Array(width * height)
  for (let y = 1; y < 7; y++) {
    for (let x = 1; x < 8; x++) {
      background[y * width + x] = 1
    }
  }
  background[6 * width + 8] = 4
  return makeGif(width, height, [
    { pixels: background, delay: 100, transparent: true },
    {
      pixels: new Uint8Array([2, 2, 2, 2, 0, 2, 2, 2, 2]),
      width: 3,
      height: 3,
      left: 2,
      top: 2,
      delay: 100,
      dispose: disposal,
      transparent: true,
    },
    {
      pixels: new Uint8Array([3, 0, 0, 3]),
      width: 2,
      height: 2,
      left: 6,
      top: 3,
      delay: 100,
      transparent: true,
    },
  ], 3)
}

describe('gif compression', () => {
  it.each([-1, 0, 3])('preserves variable total duration and loop metadata for repeat %i', async (repeat) => {
    const delays = [20, 30, 70, 150]
    const input = makeGif(8, 6, delays.map((delay, index) => solidFrame(8, 6, index + 1, delay)), repeat)
    const original = await sharp(input, { animated: true }).metadata()
    expect(original.pages).toBe(4)
    expect(original.delay).toEqual(delays)
    if (repeat === -1) {
      expect(parseGIF(new Uint8Array(input).buffer).frames.some(frame => 'application' in frame)).toBe(false)
      expect(original.loop).toBe(1)
    }
    const options = budget()
    const output = await compressGif(input, options)
    const result = await sharp(output, { animated: true }).metadata()
    expect(output.byteLength).toBeLessThanOrEqual(options.maxBytes)
    expect(result.format).toBe('gif')
    expect(result.pages).toBeGreaterThan(1)
    expect(totalDelay(result.delay)).toBe(totalDelay(original.delay))
    // Sharp 的 loop 包含首次播放，不能直接与 Netscape repeat 数字比较。
    expect(result.loop).toBe(original.loop)
  })

  it('preserves exact RGB colors in animations that fit the available palette', async () => {
    const colors = [[17, 34, 51], [123, 45, 67], [1, 2, 3]]
    const input = makeGif(8, 6, [
      solidFrame(8, 6, 0, 100),
      solidFrame(8, 6, 1, 100),
      solidFrame(8, 6, 2, 100),
    ], 0, colors)
    const original = await readAnimation(input)
    const result = await readAnimation(await compressGif(input, budget()))
    expect(result.frames).toHaveLength(original.frames.length)
    for (const [index, frame] of original.frames.entries()) {
      expect(result.frames[index]).toEqual(frame)
    }
  })

  it('keeps a short animation that returns to its first picture from collapsing into a still image', async () => {
    const input = makeGif(8, 6, [
      solidFrame(8, 6, 1, 20),
      solidFrame(8, 6, 2, 20),
      solidFrame(8, 6, 1, 20),
    ])
    const result = await readAnimation(await compressGif(input, budget()))
    expect(result.frames.length).toBeGreaterThan(1)
    expect(totalDelay(result.metadata.delay)).toBe(60)
    expect(result.frames.some(frame => !frame.equals(result.frames[0]))).toBe(true)
  })

  it('merges consecutive duplicate pictures while retaining their complete display time', async () => {
    const input = makeGif(8, 6, [
      solidFrame(8, 6, 1, 100),
      solidFrame(8, 6, 1, 150),
      solidFrame(8, 6, 2, 100),
      solidFrame(8, 6, 2, 200),
      solidFrame(8, 6, 3, 100),
    ], 3)
    const original = await readAnimation(input)
    expect(original.frames).toHaveLength(5)
    const result = await readAnimation(await compressGif(input, budget()))
    expect(result.frames).toHaveLength(3)
    expect(result.metadata.delay).toEqual([250, 300, 100])
    expect(totalDelay(result.metadata.delay)).toBe(totalDelay(original.metadata.delay))
    expect(result.metadata.loop).toBe(original.metadata.loop)
    for (const [index, originalIndex] of [0, 2, 4].entries()) {
      expectSamePicture(result.frames[index], original.frames[originalIndex])
    }
  })

  it.each([2, 3])('preserves local frame offsets, transparency and disposal %i when decoded independently', async (disposal) => {
    const input = makePatchGif(disposal)
    const imageFrames = parseGIF(new Uint8Array(input).buffer).frames.filter(frame => 'image' in frame)
    expect(imageFrames.map(frame => ({
      ...frame.image.descriptor,
      disposal: frame.gce.extras.disposal,
      transparent: frame.gce.extras.transparentColorGiven,
    }))).toMatchObject([
      { left: 0, top: 0, width: 10, height: 8, disposal: 1, transparent: true },
      { left: 2, top: 2, width: 3, height: 3, disposal, transparent: true },
      { left: 6, top: 3, width: 2, height: 2, disposal: 1, transparent: true },
    ])
    const original = await readAnimation(input)
    expect(original.frames).toHaveLength(3)
    // 先确认独立解码器能观察到透明孔洞、局部偏移和不同的清屏/恢复效果。
    expect(pixelAt(original.frames[1], original.width, 2, 2)).toEqual([0, 255, 0, 255])
    expect(pixelAt(original.frames[1], original.width, 3, 3)).toEqual([255, 0, 0, 255])
    expect(pixelAt(original.frames[2], original.width, 6, 3)).toEqual([0, 0, 255, 255])
    expect(pixelAt(original.frames[2], original.width, 0, 0)).toEqual([0, 0, 0, 0])
    expect(pixelAt(original.frames[2], original.width, 2, 2))
      .toEqual(disposal === 2 ? [0, 0, 0, 0] : [255, 0, 0, 255])
    const result = await readAnimation(await compressGif(input, budget()))
    expect([result.width, result.height]).toEqual([original.width, original.height])
    expect(result.frames).toHaveLength(original.frames.length)
    expect(result.metadata.delay).toEqual(original.metadata.delay)
    expect(result.metadata.loop).toBe(original.metadata.loop)
    for (const [index, frame] of original.frames.entries()) {
      expectSamePicture(result.frames[index], frame)
    }
  })

  it('fits a tighter byte budget by reducing quality while keeping animation, total duration and loops', async () => {
    const width = 96
    const height = 96
    const colors = Array.from({ length: 256 }, (_, index) => [
      Math.round((index >> 5) * 255 / 7),
      Math.round(((index >> 2) & 7) * 255 / 7),
      (index & 3) * 85,
    ])
    let state = 0x12345678
    const frames = Array.from({ length: 8 }, () => {
      const pixels = new Uint8Array(width * height)
      for (let index = 0; index < pixels.length; index++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        pixels[index] = state >>> 24
      }
      return { pixels, delay: 100 }
    })
    const input = makeGif(width, height, frames, 3, colors)
    const original = await sharp(input, { animated: true }).metadata()
    const generous = await compressGif(input, budget())
    // 使用实际宽松预算输出作为基准，避免把某个压缩档位或固定编码大小写进断言。
    const maxBytes = Math.floor(generous.byteLength * 0.6)
    expect(input.byteLength).toBeGreaterThan(maxBytes)
    const output = await compressGif(input, budget(maxBytes))
    expect(output.byteLength).toBeLessThanOrEqual(maxBytes)
    expect(output.byteLength).toBeLessThan(generous.byteLength)
    const result = await readAnimation(output)
    expect(result.metadata.format).toBe('gif')
    expect(result.frames.length).toBeGreaterThan(1)
    expect(totalDelay(result.metadata.delay)).toBe(totalDelay(original.delay))
    expect(result.metadata.loop).toBe(original.loop)
    expect(result.frames.slice(1).some(frame => !frame.equals(result.frames[0]))).toBe(true)
  }, 30_000)

  it('samples sparse visible pixels instead of turning transparent red details black', async () => {
    const pixels = new Uint8Array(90 * 100)
    for (let pixel = 1; pixel < pixels.length; pixel += 3) {
      pixels[pixel] = 1
    }
    const input = makeGif(90, 100, [{ pixels, delay: 100, transparent: true }])
    const original = await readAnimation(input)
    const result = await readAnimation(await compressGif(input, budget()))
    expectSamePicture(result.frames[0], original.frames[0])
  })

  it('splits long pauses without creating a 10ms frame that browsers would extend', async () => {
    const input = makeGif(8, 6, [
      solidFrame(8, 6, 1, 327680),
      solidFrame(8, 6, 1, 327680),
    ])
    const result = await sharp(await compressGif(input, budget())).metadata()
    expect(totalDelay(result.delay)).toBe(655360)
    expect(result.delay?.every(delay => delay >= 20 && delay <= 655350)).toBe(true)
  })

  it('rejects unsafe single-frame allocations before expanding source pixels', async () => {
    const input = makeGif(8, 6, [solidFrame(8, 6, 1, 100)])
    const view = new DataView(input.buffer)
    view.setUint16(6, 600, true)
    view.setUint16(8, 65535, true)
    const imageOffset = Buffer.from(input).indexOf(Buffer.from([0x21, 0xF9, 0x04])) + 8
    view.setUint16(imageOffset + 5, 600, true)
    view.setUint16(imageOffset + 7, 65535, true)
    await expect(compressGif(input, budget())).rejects.toThrow('内存')
  })

  it('rejects an already cancelled operation', async () => {
    const input = makeGif(8, 6, [solidFrame(8, 6, 1, 100), solidFrame(8, 6, 2, 100)])
    const controller = new AbortController()
    controller.abort()
    await expect(compressGif(input, { ...budget(), signal: controller.signal })).rejects.toThrow()
  })

  it('rejects an already expired deadline', async () => {
    const input = makeGif(8, 6, [solidFrame(8, 6, 1, 100), solidFrame(8, 6, 2, 100)])
    await expect(compressGif(input, { ...budget(), deadline: Date.now() - 1 })).rejects.toThrow()
  })
})
