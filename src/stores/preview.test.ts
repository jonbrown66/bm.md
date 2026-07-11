import type { usePreviewStore as usePreviewStoreType } from './preview'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type PreviewStore = typeof usePreviewStoreType

let usePreviewStore: PreviewStore

function createLocalStorageMock() {
  const store = new Map<string, string>()

  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
    clear: vi.fn(() => {
      store.clear()
    }),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    get length() {
      return store.size
    },
  } satisfies Storage
}

describe('preview store', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('localStorage', createLocalStorageMock())
    ;({ usePreviewStore } = await import('./preview'))

    usePreviewStore.setState({
      markdownStyle: 'professional',
      renderedHtmlMap: {},
      xhsAuthorName: '',
      xhsShowFooter: true,
    })
  })

  it('keeps the current markdown style when a selected style emits an empty value', () => {
    usePreviewStore.getState().setMarkdownStyle('kiko')
    usePreviewStore.getState().setMarkdownStyle('')

    expect(usePreviewStore.getState().markdownStyle).toBe('kiko')
  })

  it('keeps the current markdown style when an unknown style id is selected', () => {
    usePreviewStore.getState().setMarkdownStyle('kiko')
    usePreviewStore.getState().setMarkdownStyle('unknown-style')

    expect(usePreviewStore.getState().markdownStyle).toBe('kiko')
  })

  it('stores XHS author and footer visibility options', () => {
    usePreviewStore.getState().setXhsAuthorName('宝玉')
    usePreviewStore.getState().setXhsShowFooter(false)

    expect(usePreviewStore.getState().xhsAuthorName).toBe('宝玉')
    expect(usePreviewStore.getState().xhsShowFooter).toBe(false)
  })
})
