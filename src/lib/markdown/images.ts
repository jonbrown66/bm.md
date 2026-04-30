export interface ImageUrlReplacement {
  oldUrl: string
  newUrl: string
}

const markdownImagePattern = /!\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const htmlImageTagPattern = /<img[^>]*>/gi
const htmlSrcPattern = /\ssrc\s*=\s*(["'])([^"']+)\1/i

function isRemoteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  }
  catch {
    return false
  }
}

function collectUnique(urls: string[]): string[] {
  return Array.from(new Set(urls))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function extractRemoteImageReferences(markdown: string): string[] {
  const urls: string[] = []

  for (const match of markdown.matchAll(markdownImagePattern)) {
    const url = match[1]?.trim()
    if (url && isRemoteHttpUrl(url)) {
      urls.push(url)
    }
  }

  for (const match of markdown.matchAll(htmlImageTagPattern)) {
    const srcMatch = match[0].match(htmlSrcPattern)
    const url = srcMatch?.[2]?.trim()
    if (url && isRemoteHttpUrl(url)) {
      urls.push(url)
    }
  }

  return collectUnique(urls)
}

export function replaceImageUrls(
  markdown: string,
  replacements: ImageUrlReplacement[],
): string {
  return replacements.reduce((content, replacement) => {
    if (!replacement.oldUrl || !replacement.newUrl) {
      return content
    }

    return content.replace(
      new RegExp(escapeRegExp(replacement.oldUrl), 'g'),
      replacement.newUrl,
    )
  }, markdown)
}
