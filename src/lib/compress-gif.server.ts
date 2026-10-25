import type { ParsedGif } from 'gifuct-js'
import {
  GIF_COMPRESSION_PROFILES,
  GIF_WORKING_MEMORY_BYTES,
  ImageProcessingError,
  MAX_GIF_OUTPUT_PIXELS,
  MAX_IMAGE_FRAME_PIXELS,
} from './image-upload-policy'

interface GifCompressionOptions {
  maxBytes: number
  deadline: number
  signal?: AbortSignal
}

type GifFrame = Extract<ParsedGif['frames'][number], { image: unknown }>
type CompressionProfile = typeof GIF_COMPRESSION_PROFILES[number]

interface PendingFrame {
  rgba: Uint8Array
  delay: number
}

interface EncodingResult {
  output?: Uint8Array
  estimatedBytes?: number
}

let processingQueue = Promise.resolve()

function checkBudget(options: GifCompressionOptions) {
  options.signal?.throwIfAborted()
  if (Date.now() >= options.deadline) {
    throw new ImageProcessingError('动图自动压缩超时，请稍后重试')
  }
}

function frameDelay(frame: GifFrame): number {
  // 浏览器通常将 0～1 厘秒的帧延时按 100ms 播放，不能使用解码库的默认延时替代所有短帧。
  return (frame.gce?.delay ?? 0) <= 1 ? 100 : frame.gce.delay * 10
}

function repeatCount(gif: ParsedGif): number {
  for (const frame of gif.frames) {
    if ('application' in frame && ['NETSCAPE2.0', 'ANIMEXTS1.0'].includes(frame.application.id)) {
      const blocks = frame.application.blocks
      if (blocks[0] === 1 && blocks.length >= 3) {
        return blocks[1] | (blocks[2] << 8)
      }
    }
  }
  return -1
}

function samePixels(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false
  }
  const first = new Uint32Array(a.buffer, a.byteOffset, a.length / 4)
  const second = new Uint32Array(b.buffer, b.byteOffset, b.length / 4)
  for (let pixel = 0; pixel < first.length; pixel++) {
    if (first[pixel] !== second[pixel]) {
      return false
    }
  }
  return true
}

async function encodeAttempt(gif: ParsedGif, frames: GifFrame[], profile: CompressionProfile, options: GifCompressionOptions, estimate: boolean): Promise<EncodingResult> {
  const [{ decompressFrame }, gifenc, { default: sharp }] = await Promise.all([
    import('gifuct-js'),
    import('gifenc'),
    import('sharp'),
  ])
  // Vite 选择 ESM 入口，Node 选择 CommonJS 入口，两者的默认导出结构不同。
  const { GIFEncoder, quantize, applyPalette } = typeof gifenc.GIFEncoder === 'function' ? gifenc : gifenc.default
  checkBudget(options)
  const { width, height, backgroundColorIndex } = gif.lsd
  const scale = Math.min(1, profile.width / width, Math.sqrt(MAX_GIF_OUTPUT_PIXELS / (width * height)))
  const outputWidth = Math.max(1, Math.floor(width * scale))
  const outputHeight = Math.max(1, Math.floor(height * scale))
  const transparent = frames.some(frame => frame.gce?.extras.transparentColorGiven)
  const background = gif.gct?.[backgroundColorIndex] ?? [0, 0, 0]
  const canvas = new Uint8Array(width * height * 4)
  const fillRegion = (region: { left: number, top: number, width: number, height: number }, clear: boolean) => {
    const { left, top, width: frameWidth, height: frameHeight } = region
    for (let y = top; y < top + frameHeight; y++) {
      for (let x = left; x < left + frameWidth; x++) {
        const offset = (y * width + x) * 4
        canvas[offset] = clear ? 0 : background[0]
        canvas[offset + 1] = clear ? 0 : background[1]
        canvas[offset + 2] = clear ? 0 : background[2]
        canvas[offset + 3] = clear ? 0 : 255
      }
    }
  }
  if (!frames[0].gce?.extras.transparentColorGiven) {
    fillRegion({ left: 0, top: 0, width, height }, false)
  }

  const encoder = GIFEncoder()
  const repeat = repeatCount(gif)
  let pending: PendingFrame | undefined
  let hasDistinctFrame = false
  let time = 0
  let nextSampleAt = 0
  let lastYieldAt = Date.now()
  let writtenFrames = 0
  let estimatedBytes: number | undefined
  let plannedFrames = 0
  let plannedTime = 0
  let plannedSampleAt = 0
  for (let index = 0; index < frames.length; index++) {
    if (index < 2 || plannedTime >= plannedSampleAt || index === frames.length - 1) {
      plannedFrames++
      plannedSampleAt = (Math.floor(plannedTime * profile.fps / 1000) + 1) * 1000 / profile.fps
    }
    plannedTime += frameDelay(frames[index])
  }

  const writePending = (): boolean => {
    if (!pending) {
      return true
    }
    checkBudget(options)
    const { rgba } = pending
    const maxColors = profile.colors - (transparent ? 1 : 0)
    let palette: number[][] = []
    let index: Uint8Array = new Uint8Array(rgba.length / 4)
    const colors = new Map<number, number>()
    let exactPalette = true
    for (let pixel = 0; pixel < index.length; pixel++) {
      const offset = pixel * 4
      if (rgba[offset + 3] < 128) {
        continue
      }
      const key = rgba[offset] | (rgba[offset + 1] << 8) | (rgba[offset + 2] << 16)
      let colorIndex = colors.get(key)
      if (colorIndex === undefined) {
        if (palette.length === maxColors) {
          exactPalette = false
          break
        }
        colorIndex = palette.length
        colors.set(key, colorIndex)
        palette.push([rgba[offset], rgba[offset + 1], rgba[offset + 2]])
      }
      index[pixel] = colorIndex
    }
    if (!exactPalette) {
      const samples: number[] = []
      let visiblePixels = 0
      for (let offset = 3; offset < rgba.length; offset += 4) {
        if (rgba[offset] >= 128) {
          visiblePixels++
        }
      }
      const step = Math.max(1, Math.ceil(visiblePixels / 4096))
      let visibleIndex = 0
      for (let offset = 0; offset < rgba.length; offset += 4) {
        if (rgba[offset + 3] >= 128 && visibleIndex++ % step === 0) {
          samples.push(rgba[offset], rgba[offset + 1], rgba[offset + 2], 255)
        }
      }
      palette = samples.length
        ? quantize(new Uint8Array(samples), maxColors, { format: 'rgb565' })
        : [[0, 0, 0]]
      index = applyPalette(rgba, palette, 'rgb565')
    }
    if (!palette.length) {
      palette.push([0, 0, 0])
    }
    if (transparent) {
      palette.unshift([0, 0, 0])
      for (let pixel = 0; pixel < index.length; pixel++) {
        index[pixel] = rgba[pixel * 4 + 3] < 128 ? 0 : index[pixel] + 1
      }
    }
    let delay = pending.delay
    do {
      // GIF 的单帧延时为 16 位厘秒，合并长停顿时必须分段，避免溢出导致播放加速。
      const duration = delay > 655350 && delay % 655350 === 10
        ? 655340
        : Math.min(delay, 655350)
      encoder.writeFrame(index, outputWidth, outputHeight, {
        palette,
        delay: duration,
        repeat,
        transparent,
        transparentIndex: 0,
        dispose: transparent ? 2 : 1,
      })
      if (encoder.bytesView().length + 1 > options.maxBytes) {
        return false
      }
      delay -= duration
    } while (delay > 0)
    writtenFrames++
    if (estimate && writtenFrames >= 12 && time > 0 && plannedFrames > writtenFrames * 2) {
      const projectedFrames = Math.max(writtenFrames, plannedFrames * time / plannedTime)
      const projectedBytes = encoder.bytesView().length * plannedFrames / projectedFrames * 1.1
      if (projectedBytes > options.maxBytes * 1.05) {
        estimatedBytes = projectedBytes
        return false
      }
    }
    return true
  }

  for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
    checkBudget(options)
    const frame = frames[frameIndex]
    const { left, top, width: frameWidth, height: frameHeight } = frame.image.descriptor
    const disposal = frame.gce?.extras.disposal ?? 0
    let previous: Uint8Array | undefined
    if (disposal === 3) {
      previous = new Uint8Array(frameWidth * frameHeight * 4)
      for (let y = 0; y < frameHeight; y++) {
        const start = ((top + y) * width + left) * 4
        previous.set(canvas.subarray(start, start + frameWidth * 4), y * frameWidth * 4)
      }
    }
    const decoded = decompressFrame(frame, gif.gct, false)
    checkBudget(options)
    for (let y = 0; y < frameHeight; y++) {
      for (let x = 0; x < frameWidth; x++) {
        const colorIndex = decoded.pixels[y * frameWidth + x]
        if (colorIndex === decoded.transparentIndex) {
          continue
        }
        const color = decoded.colorTable?.[colorIndex]
        if (!color) {
          throw new ImageProcessingError('动图颜色数据损坏，无法自动压缩')
        }
        const offset = ((top + y) * width + left + x) * 4
        canvas[offset] = color[0]
        canvas[offset + 1] = color[1]
        canvas[offset + 2] = color[2]
        canvas[offset + 3] = 255
      }
    }

    const delay = frameDelay(frame)
    if (!hasDistinctFrame || time >= nextSampleAt || frameIndex === frames.length - 1) {
      let rgba: Uint8Array
      if (outputWidth === width && outputHeight === height) {
        rgba = canvas.slice()
      }
      else {
        const output = await sharp(canvas, { raw: { width, height, channels: 4 } })
          .resize(outputWidth, outputHeight, { fit: 'fill' })
          .raw()
          .timeout({ seconds: Math.max(1, Math.ceil((options.deadline - Date.now()) / 1000)) })
          .toBuffer()
        // gifenc 按整个 ArrayBuffer 读取像素，不能传入共享内存池中的 Buffer 切片。
        rgba = new Uint8Array(output)
      }
      if (pending && samePixels(pending.rgba, rgba)) {
        pending.delay += delay
      }
      else {
        hasDistinctFrame ||= pending !== undefined
        if (!writePending()) {
          return { estimatedBytes }
        }
        pending = { rgba, delay }
      }
      nextSampleAt = (Math.floor(time * profile.fps / 1000) + 1) * 1000 / profile.fps
    }
    else if (pending) {
      pending.delay += delay
    }
    time += delay

    if (previous) {
      for (let y = 0; y < frameHeight; y++) {
        canvas.set(previous.subarray(y * frameWidth * 4, (y + 1) * frameWidth * 4), ((top + y) * width + left) * 4)
      }
    }
    else if (disposal === 2) {
      fillRegion(frame.image.descriptor, frame.gce?.extras.transparentColorGiven ?? false)
    }
    if (Date.now() - lastYieldAt >= 16) {
      await new Promise(resolve => setTimeout(resolve, 0))
      lastYieldAt = Date.now()
    }
  }
  if (!writePending()) {
    return { estimatedBytes }
  }
  checkBudget(options)
  encoder.finish()
  return { output: encoder.bytes() }
}

async function compress(bytes: Uint8Array, options: GifCompressionOptions): Promise<Uint8Array> {
  checkBudget(options)
  const { parseGIF } = await import('gifuct-js')
  const gif = parseGIF(new Uint8Array(bytes).buffer)
  const { width, height } = gif.lsd
  const frames = gif.frames.filter((frame): frame is GifFrame => 'image' in frame)
  if (gif.header.signature !== 'GIF' || !width || !height || !frames.length) {
    throw new ImageProcessingError('动图数据不完整，无法自动压缩')
  }
  if (width * height > MAX_IMAGE_FRAME_PIXELS) {
    throw new ImageProcessingError('图片单帧分辨率过大（超过 4000 万像素），请先缩小图片尺寸')
  }
  let frameMemory = 0
  for (const frame of frames) {
    const descriptor = frame.image.descriptor
    if (!descriptor.width || !descriptor.height || descriptor.left + descriptor.width > width || descriptor.top + descriptor.height > height
      || frame.image.data.minCodeSize < 2 || frame.image.data.minCodeSize > 8 || !frame.image.data.blocks.length) {
      throw new ImageProcessingError('动图帧数据损坏，无法自动压缩')
    }
    // 解码库使用普通数字数组，交错帧另有一份副本；恢复上一画面也需要保存帧区域。
    const bytesPerPixel = (descriptor.lct.interlaced ? 16 : 8) + (frame.gce?.extras.disposal === 3 ? 4 : 0)
    frameMemory = Math.max(frameMemory, descriptor.width * descriptor.height * bytesPerPixel)
  }
  const estimatedMemory = bytes.byteLength * 3 + width * height * 4 + frameMemory + MAX_GIF_OUTPUT_PIXELS * 16 + options.maxBytes * 3
  if (estimatedMemory > GIF_WORKING_MEMORY_BYTES) {
    throw new ImageProcessingError('动图单帧解码内存超过处理预算，无法自动压缩')
  }
  let profileIndex = 0
  let firstEstimatedProfile: number | undefined
  let estimate = true
  while (profileIndex < GIF_COMPRESSION_PROFILES.length) {
    const profile = GIF_COMPRESSION_PROFILES[profileIndex]
    const result = await encodeAttempt(gif, frames, profile, options, estimate && profileIndex < GIF_COMPRESSION_PROFILES.length - 1)
    if (result.output) {
      return result.output
    }
    if (result.estimatedBytes) {
      firstEstimatedProfile ??= profileIndex
      const scale = Math.min(1, profile.width / width, Math.sqrt(MAX_GIF_OUTPUT_PIXELS / (width * height)))
      const relativeCost = (candidate: CompressionProfile) => {
        const candidateScale = Math.min(1, candidate.width / width, Math.sqrt(MAX_GIF_OUTPUT_PIXELS / (width * height)))
        return (candidateScale / scale) ** 2 * candidate.fps / profile.fps
          * Math.log2(candidate.colors) / Math.log2(profile.colors)
      }
      let next = profileIndex + 1
      while (next < GIF_COMPRESSION_PROFILES.length - 1
        && result.estimatedBytes * relativeCost(GIF_COMPRESSION_PROFILES[next]) > options.maxBytes * 0.9) {
        next++
      }
      profileIndex = next
    }
    else if (firstEstimatedProfile !== undefined) {
      // 预估只用于提速，最后一档失败时仍完整尝试被跳过的档位，避免误估导致拒绝有效图片。
      profileIndex = firstEstimatedProfile
      firstEstimatedProfile = undefined
      estimate = false
    }
    else {
      profileIndex++
    }
  }
  throw new ImageProcessingError('动图经过自动降帧和缩图后仍超过上传大小限制')
}

export function compressGif(bytes: Uint8Array, options: GifCompressionOptions): Promise<Uint8Array> {
  const job = processingQueue.then(() => compress(bytes, options))
  processingQueue = job.then(() => {}, () => {})
  return job
}
