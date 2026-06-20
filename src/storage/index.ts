/**
 * 存储服务统一入口
 * 图片上传统一使用 GitHub 图床，避免旧 S3/R2 配置被静默选中。
 */

import type { StorageProvider } from './types'
import { env } from '@/env'
import { GitHubStorage } from './github-storage'

export { DCStorage } from './dc-storage'
export { GitHubStorage } from './github-storage'
export { S3Storage } from './s3-storage'
export * from './types'

/** 判断是否配置了 GitHub 图床 */
export function isGitHubConfigured(): boolean {
  const { GITHUB_IMAGE_TOKEN, GITHUB_IMAGE_OWNER, GITHUB_IMAGE_REPO } = env
  return Boolean(GITHUB_IMAGE_TOKEN && GITHUB_IMAGE_OWNER && GITHUB_IMAGE_REPO)
}

/** 判断是否配置了 S3 存储 */
export function isS3Configured(): boolean {
  const { S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT } = env
  return Boolean(S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY && S3_ENDPOINT)
}

/** 获取存储提供商实例 */
export function getStorageProvider(): StorageProvider {
  return new GitHubStorage()
}
