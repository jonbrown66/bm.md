/**
 * GitHub 图床存储实现
 */

import type { StorageProvider, UploadOptions, UploadResult } from './types'
import { Buffer } from 'node:buffer'
import { env } from '@/env'
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

async function parseGitHubResponse<T>(response: Response, provider: 'github', action: string): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text()
    console.error(`GitHub ${action} failed:`, response.status, errorText)
    throw new StorageError(`${action}失败: ${response.status}`, provider)
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

  async upload(options: UploadOptions): Promise<UploadResult> {
    const config = this.getConfig()
    const key = buildGitHubImageKey({
      filename: options.filename,
      basePath: config.basePath,
    })

    try {
      const content = arrayBufferToBase64(await options.file.arrayBuffer())
      const response = await fetch(
        this.getApiUrl(config, `contents/${key}`),
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
    const entries = options.map(option => ({
      option,
      key: buildGitHubImageKey({
        filename: option.filename,
        basePath: config.basePath,
      }),
    }))

    try {
      const ref = await parseGitHubResponse<GitHubRefResponse>(
        await fetch(this.getApiUrl(config, `git/ref/heads/${config.branch}`), { headers }),
        'github',
        'get ref',
      )
      const headSha = ref.object?.sha
      if (!headSha) {
        throw new StorageError('GitHub 分支引用缺少 sha', 'github')
      }

      const commit = await parseGitHubResponse<GitHubCommitResponse>(
        await fetch(this.getApiUrl(config, `git/commits/${headSha}`), { headers }),
        'github',
        'get commit',
      )
      const baseTreeSha = commit.tree?.sha
      if (!baseTreeSha) {
        throw new StorageError('GitHub commit 缺少 tree sha', 'github')
      }

      const blobs = await Promise.all(entries.map(async ({ option }) => {
        const content = arrayBufferToBase64(await option.file.arrayBuffer())
        const blob = await parseGitHubResponse<GitHubShaResponse>(
          await fetch(this.getApiUrl(config, 'git/blobs'), {
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
        await fetch(this.getApiUrl(config, 'git/trees'), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            base_tree: baseTreeSha,
            tree: entries.map((entry, index) => ({
              path: entry.key,
              mode: '100644',
              type: 'blob',
              sha: blobs[index],
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
        await fetch(this.getApiUrl(config, 'git/commits'), {
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

      await parseGitHubResponse<GitHubRefResponse>(
        await fetch(this.getApiUrl(config, `git/refs/heads/${config.branch}`), {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            sha: newCommit.sha,
            force: false,
          }),
        }),
        'github',
        'update ref',
      )

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
    catch (error) {
      if (error instanceof StorageError) {
        throw error
      }

      throw new StorageError('批量上传过程发生错误', 'github', error)
    }
  }
}
