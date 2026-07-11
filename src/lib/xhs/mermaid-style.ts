export interface MermaidViewBox {
  x: number
  y: number
  width: number
  height: number
}

export function padMermaidViewBox(
  viewBox: MermaidViewBox,
  targetRatio = 5 / 3,
  maxExpansion = 0.25,
): MermaidViewBox {
  const { x, y, width, height } = viewBox
  if (width <= 0 || height <= 0 || targetRatio <= 0) {
    return viewBox
  }

  const ratio = width / height
  if (Math.abs(ratio - targetRatio) < 0.01) {
    return viewBox
  }

  if (ratio < targetRatio) {
    const targetWidth = Math.min(height * targetRatio, width * (1 + maxExpansion))
    return {
      x: x - (targetWidth - width) / 2,
      y,
      width: targetWidth,
      height,
    }
  }

  const targetHeight = Math.min(width / targetRatio, height * (1 + maxExpansion))
  return {
    x,
    y: y - (targetHeight - height) / 2,
    width,
    height: targetHeight,
  }
}
