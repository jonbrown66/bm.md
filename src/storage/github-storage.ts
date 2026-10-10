/**
 * GitHub 图床存储实现
 */

import type { StorageProvider, UploadOptions, UploadResult } from './types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { env } from '@/env'
import { readLimitedBody, UPLOAD_PART_BYTES } from '@/lib/image-upload-policy'
import { StorageError } from './types'

interface GitHubContentResponse {
  content?: {
    download_url?: string
  }
}

interface GitHubRefResponse {
  object?: {
    sha?: string
  }
}

interface GitHubCommitResponse {
  tree?: {
    sha?: string
  }
}

interface GitHubShaResponse {
  sha?: string
}

class GitHubRequestError extends StorageError {
  constructor(action: string, readonly status: number) {
    super(`${action}失败: ${status}`, 'github')
  }
}

interface BuildGitHubImageKeyOptions {
  filename: string
  basePath?: string
  id?: string
  now?: Date
}

interface BuildGitHubImageUrlOptions {
  owner: string
  repo: string
  branch: string
  key: string
  publicBaseUrl?: string
}

function normalizePath(value: string): string {
  return value.replace(/^\/+|\/+$/g, '')
}

function getSafeExtension(filename: string): string {
  const extension = filename.split('.').at(-1)?.toLowerCase()
  return extension && /^[a-z0-9]+$/.test(extension) ? extension : 'png'
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString('base64')
}

async function parseGitHubResponse<T>(response: Response, _provider: 'github', action: string): Promise<T> {
  if (!response.ok) {
    await response.body?.cancel()
    console.error(`GitHub ${action} failed:`, response.status)
    throw new GitHubRequestError(action, response.status)
  }

  return await response.json() as T
}

export function buildGitHubImageKey(options: BuildGitHubImageKeyOptions): string {
  const basePath = normalizePath(options.basePath || 'images')
  const date = (options.now || new Date()).toISOString().split('T')[0]
  const id = options.id || crypto.randomUUID()
  const extension = getSafeExtension(options.filename)

  return `${basePath}/${date}/${id}.${extension}`
}

export function buildGitHubImageUrl(options: BuildGitHubImageUrlOptions): string {
  const safeKey = normalizePath(options.key)

  if (options.publicBaseUrl) {
    return `${options.publicBaseUrl.replace(/\/$/, '')}/${safeKey}`
  }

  return `https://raw.githubusercontent.com/${options.owner}/${options.repo}/${options.branch}/${safeKey}`
}

export class GitHubStorage implements StorageProvider {
  readonly type = 'github' as const

  constructor(private readonly signal?: AbortSignal) {}

  get cacheScope(): string {
    const { owner, repo, branch, basePath, publicBaseUrl } = this.getConfig()
    return JSON.stringify(['github', owner, repo, branch, basePath, publicBaseUrl])
  }

  private getConfig() {
    const {
      GITHUB_IMAGE_TOKEN,
      GITHUB_IMAGE_OWNER,
      GITHUB_IMAGE_REPO,
      GITHUB_IMAGE_BRANCH,
      GITHUB_IMAGE_PATH,
      GITHUB_IMAGE_PUBLIC_BASE_URL,
    } = env

    if (!GITHUB_IMAGE_TOKEN || !GITHUB_IMAGE_OWNER || !GITHUB_IMAGE_REPO) {
      throw new StorageError('GitHub 图床配置缺失', 'github')
    }

    return {
      token: GITHUB_IMAGE_TOKEN,
      owner: GITHUB_IMAGE_OWNER,
      repo: GITHUB_IMAGE_REPO,
      branch: GITHUB_IMAGE_BRANCH || 'main',
      basePath: GITHUB_IMAGE_PATH,
      publicBaseUrl: GITHUB_IMAGE_PUBLIC_BASE_URL,
    }
  }

  private getHeaders(token: string): HeadersInit {
    return {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
  }

  private getApiUrl(config: ReturnType<GitHubStorage['getConfig']>, path: string): string {
    return `https://api.github.com/repos/${config.owner}/${config.repo}/${path}`
  }

  /** 每次请求都有超时；只重试网络异常和暂时性状态，不重试权限或参数错误。 */
  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const config = this.getConfig()
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(this.getApiUrl(config, path), {
          ...options,
          headers: { ...this.getHeaders(config.token), ...options.headers },
          signal: this.signal ? AbortSignal.any([this.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
        })
        const retryAfter = Number(response.headers.get('retry-after') || 0)
        const temporary = [429, 500, 502, 503, 504].includes(response.status)
          || (response.status === 403 && retryAfter > 0)
        if (!temporary || attempt >= 2 || retryAfter > 5) {
          return response
        }
        await response.body?.cancel()
        await new Promise(resolve => setTimeout(resolve, Math.max(retryAfter * 1000, 500 * 2 ** attempt)))
      }
      catch (error) {
        if (this.signal?.aborted) {
          throw error
        }
        if (attempt >= 2 || !(error instanceof TypeError || (error instanceof DOMException && error.name === 'TimeoutError'))) {
          throw error
        }
        await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt))
      }
    }
  }

  async createUploadBlob(bytes: Uint8Array): Promise<string> {
    const result = await parseGitHubResponse<GitHubShaResponse>(await this.request('git/blobs', {
      method: 'POST',
      body: JSON.stringify({ content: Buffer.from(bytes).toString('base64'), encoding: 'base64' }),
    }), 'github', 'create blob')
    if (!result.sha || !/^[a-f0-9]{40}$/.test(result.sha)) {
      throw new StorageError('GitHub blob 响应缺少有效 sha', 'github')
    }
    return result.sha
  }

  async readUploadBlob(sha: string): Promise<ArrayBuffer> {
    if (!/^[a-f0-9]{40}$/.test(sha)) {
      throw new StorageError('GitHub 分片 sha 无效', 'github')
    }
    const response = await this.request(`git/blobs/${sha}`, { headers: { Accept: 'application/vnd.github.raw+json' } })
    if (!response.ok) {
      await response.body?.cancel()
      throw new GitHubRequestError('read blob', response.status)
    }
    return readLimitedBody(response, UPLOAD_PART_BYTES, '图片分片大小超过限制')
  }

  private async getUploadKey(options: UploadOptions): Promise<string> {
    const hash = createHash('sha256').update(Buffer.from(await options.file.arrayBuffer())).digest('hex')
    return `${normalizePath(this.getConfig().basePath || 'images')}/v2/${hash}.${getSafeExtension(options.filename)}`
  }

  isUploadedImageUrl(url: string): boolean {
    const config = this.getConfig()
    const prefix = `${buildGitHubImageUrl({ ...config, key: `${normalizePath(config.basePath || 'images')}/v2` })}/`
    return url.startsWith(prefix) && /^[a-f0-9]{64}\.(?:jpg|png|gif)$/.test(url.slice(prefix.length))
  }

  async upload(options: UploadOptions): Promise<UploadResult> {
    const config = this.getConfig()
    const key = await this.getUploadKey(options)

    try {
      const content = arrayBufferToBase64(await options.file.arrayBuffer())
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await this.request(
          `contents/${key}`,
          {
            method: 'PUT',
            headers: this.getHeaders(config.token),
            body: JSON.stringify({
              message: `upload image ${key}`,
              content,
              branch: config.branch,
            }),
          },
        )

        // 内容寻址让跨进程重试也使用同一路径；同内容已存在时直接复用。
        if ([409, 422].includes(response.status)) {
          await response.body?.cancel()
          const existingResponse = await this.request(`contents/${key}?ref=${encodeURIComponent(config.branch)}`)
          if (response.status === 409 && existingResponse.status === 404 && attempt < 2) {
            await existingResponse.body?.cancel()
            await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt))
            continue
          }
          const existing = await parseGitHubResponse<{ sha?: string }>(existingResponse, 'github', 'get existing image')
          const expectedSha = createHash('sha1').update(`blob ${options.file.size}\0`).update(Buffer.from(await options.file.arrayBuffer())).digest('hex')
          if (existing.sha === expectedSha) {
            return { url: buildGitHubImageUrl({ ...config, key }) }
          }
        }

        const data = await parseGitHubResponse<GitHubContentResponse>(response, 'github', 'upload')
        const url = buildGitHubImageUrl({
          owner: config.owner,
          repo: config.repo,
          branch: config.branch,
          key,
          publicBaseUrl: config.publicBaseUrl,
        })

        return { url: url || data.content?.download_url || '' }
      }
      throw new StorageError('GitHub 分支繁忙，请稍后重试', 'github')
    }
    catch (error) {
      if (error instanceof StorageError) {
        throw error
      }

      throw new StorageError('上传过程发生错误', 'github', error)
    }
  }

  async uploadMany(options: UploadOptions[]): Promise<UploadResult[]> {
    if (options.length === 0) {
      return []
    }

    const config = this.getConfig()
    const headers = this.getHeaders(config.token)
    const entries = await Promise.all(options.map(async option => ({
      option,
      key: await this.getUploadKey(option),
    })))

    try {
      let blobs: string[] | undefined
      for (let attempt = 0; attempt < 3; attempt++) {
        const ref = await parseGitHubResponse<GitHubRefResponse>(
          await this.request(`git/ref/heads/${config.branch}`, { headers }),
          'github',
          'get ref',
        )
        const headSha = ref.object?.sha
        if (!headSha) {
          throw new StorageError('GitHub 分支引用缺少 sha', 'github')
        }

        const commit = await parseGitHubResponse<GitHubCommitResponse>(
          await this.request(`git/commits/${headSha}`, { headers }),
          'github',
          'get commit',
        )
        const baseTreeSha = commit.tree?.sha
        if (!baseTreeSha) {
          throw new StorageError('GitHub commit 缺少 tree sha', 'github')
        }

        const blobShas = blobs ??= await Promise.all(entries.map(async ({ option }) => {
          const content = arrayBufferToBase64(await option.file.arrayBuffer())
          const blob = await parseGitHubResponse<GitHubShaResponse>(
            await this.request('git/blobs', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                content,
                encoding: 'base64',
              }),
            }),
            'github',
            'create blob',
          )

          if (!blob.sha) {
            throw new StorageError('GitHub blob 响应缺少 sha', 'github')
          }

          return blob.sha
        }))

        const tree = await parseGitHubResponse<GitHubShaResponse>(
          await this.request('git/trees', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              base_tree: baseTreeSha,
              tree: entries.map((entry, index) => ({
                path: entry.key,
                mode: '100644',
                type: 'blob',
                sha: blobShas[index],
              })),
            }),
          }),
          'github',
          'create tree',
        )
        if (!tree.sha) {
          throw new StorageError('GitHub tree 响应缺少 sha', 'github')
        }

        const newCommit = await parseGitHubResponse<GitHubShaResponse>(
          await this.request('git/commits', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              message: `upload ${entries.length} images`,
              tree: tree.sha,
              parents: [headSha],
            }),
          }),
          'github',
          'create commit',
        )
        if (!newCommit.sha) {
          throw new StorageError('GitHub commit 响应缺少 sha', 'github')
        }

        const updated = await this.request(`git/refs/heads/${config.branch}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            sha: newCommit.sha,
            force: false,
          }),
        })
        if ([409, 422].includes(updated.status) && attempt < 2) {
          await updated.body?.cancel()
          continue
        }
        await parseGitHubResponse<GitHubRefResponse>(updated, 'github', 'update ref')

        return entries.map(entry => ({
          url: buildGitHubImageUrl({
            owner: config.owner,
            repo: config.repo,
            branch: config.branch,
            key: entry.key,
            publicBaseUrl: config.publicBaseUrl,
          }),
        }))
      }
      throw new StorageError('GitHub 分支繁忙，请稍后重试', 'github')
    }
    catch (error) {
      if (error instanceof StorageError) {
        throw error
      }

      throw new StorageError('批量上传过程发生错误', 'github', error)
    }
  }
}
