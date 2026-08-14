import type { XhsCoverImageElement } from './cover-document-types'

export const XHS_IMAGE_PERSPECTIVE = 900

interface ProjectedBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

function toRadians(degrees: number) {
  return degrees * Math.PI / 180
}

function getProjectedBounds(element: XhsCoverImageElement): ProjectedBounds | null {
  const halfWidth = element.width / 2
  const halfHeight = element.height / 2
  const rotationX = toRadians(element.rotationX)
  const rotationY = toRadians(element.rotationY)
  const rotationZ = toRadians(element.rotationZ)
  const sinX = Math.sin(rotationX)
  const cosX = Math.cos(rotationX)
  const sinY = Math.sin(rotationY)
  const cosY = Math.cos(rotationY)
  const sinZ = Math.sin(rotationZ)
  const cosZ = Math.cos(rotationZ)
  const corners = [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [-halfWidth, halfHeight],
    [halfWidth, halfHeight],
  ]
  const projectedPoints: Array<[number, number]> = []

  for (const [x, y] of corners) {
    const rotatedZx = cosZ * x - sinZ * y
    const rotatedZy = sinZ * x + cosZ * y
    const rotatedYx = cosY * rotatedZx
    const rotatedYz = -sinY * rotatedZx
    const rotatedXy = cosX * rotatedZy - sinX * rotatedYz
    const rotatedXz = sinX * rotatedZy + cosX * rotatedYz
    const perspectiveDenominator = XHS_IMAGE_PERSPECTIVE - rotatedXz

    if (perspectiveDenominator <= 0) {
      return null
    }

    const perspectiveScale = XHS_IMAGE_PERSPECTIVE / perspectiveDenominator
    projectedPoints.push([
      halfWidth + rotatedYx * perspectiveScale,
      halfHeight + rotatedXy * perspectiveScale,
    ])
  }

  const xValues = projectedPoints.map(([x]) => x)
  const yValues = projectedPoints.map(([, y]) => y)

  return {
    minX: Math.min(...xValues),
    maxX: Math.max(...xValues),
    minY: Math.min(...yValues),
    maxY: Math.max(...yValues),
  }
}

function getAxisOffset(origin: number, min: number, max: number, canvasSize: number) {
  const lowerOffset = -origin - min
  const upperOffset = canvasSize - origin - max

  // 投影尺寸大于画布时无法靠平移完整容纳，保留原始位置，避免强行改变构图。
  if (lowerOffset > upperOffset) {
    return 0
  }

  return Math.min(Math.max(0, lowerOffset), upperOffset)
}

export function getCoverImageTransformOffset(
  element: XhsCoverImageElement,
  canvasWidth: number,
  canvasHeight: number,
) {
  if (element.rotationX === 0 && element.rotationY === 0 && element.rotationZ === 0) {
    return { x: 0, y: 0 }
  }

  const bounds = getProjectedBounds(element)
  if (!bounds) {
    return { x: 0, y: 0 }
  }

  return {
    x: getAxisOffset(element.x, bounds.minX, bounds.maxX, canvasWidth),
    y: getAxisOffset(element.y, bounds.minY, bounds.maxY, canvasHeight),
  }
}
