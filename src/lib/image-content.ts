const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'])

const contentTypeExtensions: Record<string, string> = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value)
}

export function detectImageContentType(bytes: Uint8Array): string | undefined {
  if (startsWith(bytes, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) {
    return 'image/png'
  }

  if (startsWith(bytes, [0xFF, 0xD8, 0xFF])) {
    return 'image/jpeg'
  }

  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return 'image/gif'
  }

  const ascii = new TextDecoder('ascii').decode(bytes.slice(0, 12))
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') {
    return 'image/webp'
  }

  return undefined
}

export function getImageFilename(url: string, contentType: string): string {
  const pathname = new URL(url).pathname
  const rawName = decodeURIComponent(pathname.split('/').filter(Boolean).at(-1) || '')
  const extension = rawName.split('.').at(-1)?.toLowerCase()

  if (rawName && extension && imageExtensions.has(extension)) {
    return rawName
  }

  const detectedExtension = contentTypeExtensions[contentType] || 'png'
  return `image.${detectedExtension}`
}
