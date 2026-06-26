import type { StorageError } from './types'

export function getPublicStorageErrorMessage(error: StorageError): string {
  return error.message
}
