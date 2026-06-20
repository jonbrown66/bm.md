import { afterEach, describe, expect, it } from 'vitest'
import { getStorageProvider } from './index'

describe('storage provider selection', () => {
  afterEach(() => {
    delete process.env.GITHUB_IMAGE_TOKEN
    delete process.env.GITHUB_IMAGE_OWNER
    delete process.env.GITHUB_IMAGE_REPO
    delete process.env.S3_ACCESS_KEY_ID
    delete process.env.S3_SECRET_ACCESS_KEY
    delete process.env.S3_ENDPOINT
  })

  it('uses GitHub image storage even when legacy S3/R2 config is present', () => {
    process.env.GITHUB_IMAGE_TOKEN = 'test-token'
    process.env.GITHUB_IMAGE_OWNER = 'jonbrown66'
    process.env.GITHUB_IMAGE_REPO = 'imagebad'
    process.env.S3_ACCESS_KEY_ID = 'legacy-key'
    process.env.S3_SECRET_ACCESS_KEY = 'legacy-secret'
    process.env.S3_ENDPOINT = 'https://legacy-r2.example.com'

    expect(getStorageProvider().type).toBe('github')
  })

  it('does not fall back to legacy S3/R2 storage when GitHub config is missing', () => {
    process.env.S3_ACCESS_KEY_ID = 'legacy-key'
    process.env.S3_SECRET_ACCESS_KEY = 'legacy-secret'
    process.env.S3_ENDPOINT = 'https://legacy-r2.example.com'

    expect(getStorageProvider().type).toBe('github')
  })
})
