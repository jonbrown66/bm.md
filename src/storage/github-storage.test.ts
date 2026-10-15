import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildGitHubImageKey,
  buildGitHubImageUrl,
  GitHubStorage,
} from './github-storage'

describe('github storage helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    delete process.env.GITHUB_IMAGE_TOKEN
    delete process.env.GITHUB_IMAGE_OWNER
    delete process.env.GITHUB_IMAGE_REPO
    delete process.env.GITHUB_IMAGE_BRANCH
    delete process.env.GITHUB_IMAGE_PATH
    delete process.env.GITHUB_IMAGE_PUBLIC_BASE_URL
  })

  it('builds dated image keys under configured path', () => {
    const key = buildGitHubImageKey({
      filename: 'cover.png',
      basePath: 'images',
      id: 'image-id',
      now: new Date('2026-06-19T08:00:00.000Z'),
    })

    expect(key).toBe('images/2026-06-19/image-id.png')
  })

  it('isolates copy caches by destination without including credentials', () => {
    process.env.GITHUB_IMAGE_TOKEN = 'test-token'
    process.env.GITHUB_IMAGE_OWNER = 'example-owner'
    process.env.GITHUB_IMAGE_REPO = 'first-repo'
    const storage = new GitHubStorage()
    const firstScope = storage.cacheScope
    expect(firstScope).not.toContain('test-token')
    process.env.GITHUB_IMAGE_REPO = 'second-repo'
    expect(storage.cacheScope).not.toBe(firstScope)
  })

  it('uses cdn base url when configured', () => {
    const url = buildGitHubImageUrl({
      owner: 'jonbrown66',
      repo: 'imagebad',
      branch: 'main',
      key: 'images/2026-06-19/image-id.png',
      publicBaseUrl: 'https://img.example.com/',
    })

    expect(url).toBe('https://img.example.com/images/2026-06-19/image-id.png')
  })

  it('falls back to raw github url without cdn base url', () => {
    const url = buildGitHubImageUrl({
      owner: 'jonbrown66',
      repo: 'imagebad',
      branch: 'main',
      key: 'images/2026-06-19/image-id.png',
    })

    expect(url).toBe('https://raw.githubusercontent.com/jonbrown66/imagebad/main/images/2026-06-19/image-id.png')
  })

  it('uploads image content to github and returns cdn url', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-19T08:00:00.000Z'))
    vi.stubGlobal('crypto', {
      ...crypto,
      randomUUID: () => 'image-id',
    })

    process.env.GITHUB_IMAGE_TOKEN = 'test-token'
    process.env.GITHUB_IMAGE_OWNER = 'jonbrown66'
    process.env.GITHUB_IMAGE_REPO = 'imagebad'
    process.env.GITHUB_IMAGE_BRANCH = 'main'
    process.env.GITHUB_IMAGE_PATH = 'images'
    process.env.GITHUB_IMAGE_PUBLIC_BASE_URL = 'https://img.example.com'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: { download_url: 'https://raw.example.com/fallback.png' } }), {
        status: 201,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await new GitHubStorage().upload({
      file: new Blob(['hello'], { type: 'image/png' }),
      filename: 'cover.png',
      contentType: 'image/png',
    })
    const key = `images/v2/${createHash('sha256').update('hello').digest('hex')}.png`

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.github.com/repos/jonbrown66/imagebad/contents/${key}`,
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          message: `upload image ${key}`,
          content: 'aGVsbG8=',
          branch: 'main',
        }),
      }),
    )
    expect(result.url).toBe(`https://img.example.com/${key}`)
  })

  it('uploads multiple images with one tree commit', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-19T08:00:00.000Z'))
    const ids = ['first-id', 'second-id']
    vi.stubGlobal('crypto', {
      ...crypto,
      randomUUID: () => ids.shift() || 'fallback-id',
    })

    process.env.GITHUB_IMAGE_TOKEN = 'test-token'
    process.env.GITHUB_IMAGE_OWNER = 'jonbrown66'
    process.env.GITHUB_IMAGE_REPO = 'imagebad'
    process.env.GITHUB_IMAGE_BRANCH = 'main'
    process.env.GITHUB_IMAGE_PATH = 'images'
    process.env.GITHUB_IMAGE_PUBLIC_BASE_URL = 'https://img.example.com'

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ object: { sha: 'head-sha' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tree: { sha: 'base-tree-sha' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: 'blob-sha-1' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: 'blob-sha-2' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: 'tree-sha' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: 'commit-sha' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ object: { sha: 'commit-sha' } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const results = await new GitHubStorage().uploadMany([
      {
        file: new Blob(['first'], { type: 'image/png' }),
        filename: 'first.png',
        contentType: 'image/png',
      },
      {
        file: new Blob(['second'], { type: 'image/jpeg' }),
        filename: 'second.jpg',
        contentType: 'image/jpeg',
      },
    ])
    const firstKey = `images/v2/${createHash('sha256').update('first').digest('hex')}.png`
    const secondKey = `images/v2/${createHash('sha256').update('second').digest('hex')}.jpg`

    expect(fetchMock).toHaveBeenCalledTimes(7)
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'https://api.github.com/repos/jonbrown66/imagebad/git/trees',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          base_tree: 'base-tree-sha',
          tree: [
            {
              path: firstKey,
              mode: '100644',
              type: 'blob',
              sha: 'blob-sha-1',
            },
            {
              path: secondKey,
              mode: '100644',
              type: 'blob',
              sha: 'blob-sha-2',
            },
          ],
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      'https://api.github.com/repos/jonbrown66/imagebad/git/refs/heads/main',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          sha: 'commit-sha',
          force: false,
        }),
      }),
    )
    expect(results.map(result => result.url)).toEqual([
      `https://img.example.com/${firstKey}`,
      `https://img.example.com/${secondKey}`,
    ])
  })

  function configure() {
    process.env.GITHUB_IMAGE_TOKEN = 'test-token'
    process.env.GITHUB_IMAGE_OWNER = 'example'
    process.env.GITHUB_IMAGE_REPO = 'images'
  }

  describe('public image availability', () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aIj8AAAAASUVORK5CYII=', 'base64')
    const hash = createHash('sha256').update(png).digest('hex')
    const cdn = `https://img.example.com/images/v2/${hash}.png`
    const origin = `https://raw.githubusercontent.com/example/images/main/images/v2/${hash}.png`
    const imageResponse = () => new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } })
    const storage = () => {
      configure()
      process.env.GITHUB_IMAGE_PUBLIC_BASE_URL = 'https://img.example.com'
      return new GitHubStorage()
    }

    it('keeps a healthy CDN URL and never sends credentials to public image hosts', async () => {
      const request = vi.fn().mockImplementation(imageResponse)
      vi.stubGlobal('fetch', request)
      await expect(storage().resolveUploadedImageUrl(cdn)).resolves.toBe(cdn)
      expect(request).toHaveBeenCalledOnce()
      expect(new Headers(request.mock.calls[0][1].headers).has('authorization')).toBe(false)
      expect(request.mock.calls[0][1].method).toBeUndefined()
    })

    it('retries a transient CDN 503 and keeps the original link after recovery', async () => {
      const request = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockImplementation(imageResponse)
      vi.stubGlobal('fetch', request)
      await expect(storage().resolveUploadedImageUrl(cdn)).resolves.toBe(cdn)
      expect(request.mock.calls.map(([url]) => url)).toEqual([cdn, cdn])
    })

    it.each([503, 404])('falls back to a verified origin after repeated CDN %i responses', async (status) => {
      const request = vi.fn().mockImplementation((url: string) => url === cdn ? new Response('', { status }) : imageResponse())
      vi.stubGlobal('fetch', request)
      const provider = storage()
      await expect(provider.resolveUploadedImageUrl(cdn)).resolves.toBe(origin)
      expect(request.mock.calls.map(([url]) => url)).toEqual([cdn, cdn, origin])
      expect(provider.isUploadedImageUrl(origin)).toBe(true)
    })

    it('keeps a healthy origin fallback instead of replacing it with the CDN', async () => {
      const request = vi.fn().mockImplementation(imageResponse)
      vi.stubGlobal('fetch', request)
      await expect(storage().resolveUploadedImageUrl(origin)).resolves.toBe(origin)
      expect(request.mock.calls.map(([url]) => url)).toEqual([origin])
    })

    it('rejects when CDN and origin both fail instead of returning an unverified URL', async () => {
      const request = vi.fn().mockImplementation(() => new Response('', { status: 503 }))
      vi.stubGlobal('fetch', request)
      await expect(storage().resolveUploadedImageUrl(cdn)).rejects.toThrow('图片外链暂时不可用')
      expect(request.mock.calls.map(([url]) => url)).toEqual([cdn, cdn, origin, origin])
    })

    it.each(['error page', 'different image', 'oversized image'])('does not accept a 200 response containing %s', async (failure) => {
      const request = vi.fn().mockImplementation((url: string) => {
        if (url === origin)
          return imageResponse()
        if (failure === 'oversized image')
          return new Response('', { headers: { 'content-length': String(5 * 1024 * 1024) } })
        return new Response(failure === 'error page' ? '<html>Service Unavailable</html>' : new Uint8Array([...png, 1]), { headers: { 'content-type': 'image/png' } })
      })
      vi.stubGlobal('fetch', request)
      await expect(storage().resolveUploadedImageUrl(cdn)).resolves.toBe(origin)
      expect(request.mock.calls.map(([url]) => url)).toEqual([cdn, origin])
    })

    it('does not retry a permanent failure or wait through a long Retry-After', async () => {
      const request = vi.fn().mockResolvedValueOnce(new Response('', { status: 403 })).mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '30' } }))
      vi.stubGlobal('fetch', request)
      await expect(storage().resolveUploadedImageUrl(cdn)).rejects.toThrow('外链暂时不可用')
      expect(request.mock.calls.map(([url]) => url)).toEqual([cdn, origin])
    })

    it('rejects foreign URLs before making any request', async () => {
      const request = vi.fn()
      vi.stubGlobal('fetch', request)
      await expect(storage().resolveUploadedImageUrl(cdn.replace('img.example.com', 'other.example.com'))).rejects.toThrow('不属于当前图床')
      expect(request).not.toHaveBeenCalled()
    })

    it('stops before fetching when the overall upload was cancelled', async () => {
      storage()
      const controller = new AbortController()
      controller.abort()
      const request = vi.fn()
      vi.stubGlobal('fetch', request)
      await expect(new GitHubStorage(controller.signal).resolveUploadedImageUrl(cdn)).rejects.toThrow()
      expect(request).not.toHaveBeenCalled()
    })
  })
  it('recognizes only current-policy content-addressed URLs from this destination', () => {
    configure()
    const storage = new GitHubStorage()
    const url = `https://raw.githubusercontent.com/example/images/main/images/v2/${'a'.repeat(64)}.gif`
    expect(storage.isUploadedImageUrl(url)).toBe(true)
    expect(storage.isUploadedImageUrl(url.replace('/example/', '/other/'))).toBe(false)
    expect(storage.isUploadedImageUrl(`${url}?original=1`)).toBe(false)
    expect(storage.isUploadedImageUrl(url.replace('/v2/', '/2026-10-10/'))).toBe(false)
  })
  it('reuses an existing identical image after an uncertain request without overwriting other content', async () => {
    configure()
    const request = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 422 })).mockResolvedValueOnce(Response.json({ sha: 'b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0' }))
    vi.stubGlobal('fetch', request)
    const result = await new GitHubStorage().upload({ file: new Blob(['hello']), filename: 'renamed.png', contentType: 'image/png' })
    expect(result.url).toContain('/images/v2/')
    expect(request.mock.calls.filter(([, init]) => init.method === 'PUT')).toHaveLength(1)
    request.mockReset().mockResolvedValueOnce(new Response('{}', { status: 422 })).mockResolvedValueOnce(Response.json({ sha: 'different-content' }))
    await expect(new GitHubStorage().upload({ file: new Blob(['hello']), filename: 'renamed.png', contentType: 'image/png' })).rejects.toThrow('422')
  })
  it('rebases a conflicting batch onto the latest head while reusing blobs and preserving unrelated files', async () => {
    configure()
    let heads = 0
    let patches = 0
    const request = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (url.includes('git/ref/heads/'))
        return Response.json({ object: { sha: `head-${++heads}` } })
      if (url.includes('git/commits/') && !init.method)
        return Response.json({ tree: { sha: `tree-${heads}` } })
      if (url.endsWith('git/blobs'))
        return Response.json({ sha: 'blob' })
      if (url.endsWith('git/trees'))
        return Response.json({ sha: 'new-tree' })
      if (url.endsWith('git/commits'))
        return Response.json({ sha: 'new-commit' })
      if (init.method === 'PATCH')
        return new Response('{}', { status: ++patches === 1 ? 409 : 200 })
      throw new Error('unexpected request')
    })
    vi.stubGlobal('fetch', request)
    const result = await new GitHubStorage().uploadMany(['first', 'second'].map(value => ({ file: new Blob([value]), filename: `${value}.png`, contentType: 'image/png' })))
    expect(result).toHaveLength(2)
    expect(request.mock.calls.filter(([url]) => url.endsWith('git/blobs'))).toHaveLength(2)
    expect(request.mock.calls.filter(([url]) => url.endsWith('git/trees')).map(([, init]) => JSON.parse(init.body).base_tree)).toEqual(['tree-1', 'tree-2'])
    expect(request.mock.calls.filter(([, init]) => init.method === 'PATCH').every(([, init]) => JSON.parse(init.body).force === false)).toBe(true)
  })
  it('retries a single-image branch conflict when another writer changed the head before this file existed', async () => {
    configure()
    const request = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 409 })).mockResolvedValueOnce(new Response('{}', { status: 404 })).mockResolvedValueOnce(Response.json({ content: { download_url: 'https://images.example/new.png' } }))
    vi.stubGlobal('fetch', request)
    await expect(new GitHubStorage().upload({ file: new Blob(['hello']), filename: 'hello.png', contentType: 'image/png' })).resolves.toMatchObject({ url: expect.stringContaining('/images/v2/') })
    expect(request).toHaveBeenCalledTimes(3)
    expect(request.mock.calls[0][0]).toBe(request.mock.calls[2][0])
    expect(request.mock.calls[0][1].body).toBe(request.mock.calls[2][1].body)
  })
  it('retries temporary GitHub failures and stops immediately on authentication errors', async () => {
    configure()
    const request = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 503 })).mockResolvedValueOnce(Response.json({ sha: 'a'.repeat(40) }))
    vi.stubGlobal('fetch', request)
    await expect(new GitHubStorage().createUploadBlob(new Uint8Array([1]))).resolves.toBe('a'.repeat(40))
    expect(request).toHaveBeenCalledTimes(2)
    request.mockReset().mockResolvedValue(new Response('{}', { status: 401 }))
    await expect(new GitHubStorage().createUploadBlob(new Uint8Array([1]))).rejects.toThrow('401')
    expect(request).toHaveBeenCalledOnce()
  })
})
