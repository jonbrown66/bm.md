export type PdfRgbColor = readonly [number, number, number]

const WHITE: PdfRgbColor = [255, 255, 255]

function clampChannel(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)))
}

function parseAlpha(value: string | undefined) {
  if (!value)
    return 1

  const alpha = value.endsWith('%')
    ? Number.parseFloat(value) / 100
    : Number.parseFloat(value)

  return Number.isFinite(alpha) ? alpha : 0
}

export function parsePdfBackgroundColor(value: string | undefined): PdfRgbColor {
  const color = value?.trim().toLowerCase()
  if (!color || color === 'transparent')
    return WHITE

  const match = color.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/,
  )
  if (!match)
    return WHITE

  if (parseAlpha(match[4]) <= 0)
    return WHITE

  return [
    clampChannel(Number(match[1])),
    clampChannel(Number(match[2])),
    clampChannel(Number(match[3])),
  ]
}
