import { describe, expect, it } from 'vitest'
import { getPublicStorageErrorMessage } from './errors'
import { StorageError } from './types'

describe('storage error messages', () => {
  it('exposes provider storage errors without leaking raw causes', () => {
    const error = new StorageError('upload失败: 403', 'github', {
      token: 'secret-token',
    })

    expect(getPublicStorageErrorMessage(error)).toBe('[github] upload失败: 403')
  })
})
