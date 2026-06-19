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

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/jonbrown66/imagebad/contents/images/2026-06-19/image-id.png',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          message: 'upload image images/2026-06-19/image-id.png',
          content: 'aGVsbG8=',
          branch: 'main',
        }),
      }),
    )
    expect(result.url).toBe('https://img.example.com/images/2026-06-19/image-id.png')
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
              path: 'images/2026-06-19/first-id.png',
              mode: '100644',
              type: 'blob',
              sha: 'blob-sha-1',
            },
            {
              path: 'images/2026-06-19/second-id.jpg',
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
      'https://img.example.com/images/2026-06-19/first-id.png',
      'https://img.example.com/images/2026-06-19/second-id.jpg',
    ])
  })
})
