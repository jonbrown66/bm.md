declare module 'gifenc' {
  interface FrameOptions {
    palette: number[][]
    delay: number
    repeat?: number
    transparent?: boolean
    transparentIndex?: number
    dispose?: number
  }

  interface Encoder {
    writeFrame: (index: Uint8Array, width: number, height: number, options: FrameOptions) => void
    finish: () => void
    bytes: () => Uint8Array
    bytesView: () => Uint8Array
  }

  export function GIFEncoder(): Encoder
  export function quantize(data: Uint8Array, colors: number, options?: { format: 'rgb565' }): number[][]
  export function applyPalette(data: Uint8Array, palette: number[][], format?: 'rgb565'): Uint8Array

  const gifenc: {
    GIFEncoder: typeof GIFEncoder
    quantize: typeof quantize
    applyPalette: typeof applyPalette
  }
  export default gifenc
}
