import type { TransactionSpec } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { importFilesToEditor } from './file-import'

const mocks = vi.hoisted(() => ({
  fileId: 'first',
  upload: vi.fn(),
  toast: { loading: vi.fn(), warning: vi.fn(), success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/services/upload', () => ({ uploadImage: mocks.upload }))
vi.mock('@/stores/files', () => ({ useFilesStore: { getState: () => ({ activeFileId: mocks.fileId }) } }))
vi.mock('sonner', () => ({ toast: mocks.toast }))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.fileId = 'first'
})
function editor(doc: string) {
  const model = {
    state: EditorState.create({ doc, selection: { anchor: doc.length } }),
    dom: { isConnected: true },
    dispatch: vi.fn((spec: TransactionSpec) => { model.state = model.state.update(spec).state }),
  }
  return { model, view: model as unknown as EditorView }
}
const image = () => new File(['image'], 'upload.png', { type: 'image/png' })

describe('local image import while upload is pending', () => {
  it('does not insert an uploaded image into another document after switching', async () => {
    const { model, view } = editor('original text')
    mocks.upload.mockImplementation(async () => {
      mocks.fileId = 'second'
      return { url: 'https://images.example/image.png' }
    })
    await importFilesToEditor(view, [image()])
    expect(model.dispatch).not.toHaveBeenCalled()
    expect(model.state.doc.toString()).toBe('original text')
    expect(mocks.toast.warning).toHaveBeenCalledOnce()
  })
  it('inserts safely when text has been deleted during upload', async () => {
    const { model, view } = editor('text that will be deleted')
    mocks.upload.mockImplementation(async () => {
      model.state = model.state.update({ changes: { from: 0, to: model.state.doc.length, insert: '' } }).state
      return { url: 'https://images.example/image.png' }
    })
    await importFilesToEditor(view, [image()])
    expect(model.state.doc.toString()).toContain('![upload.png](https://images.example/image.png)')
    expect(mocks.toast.error).not.toHaveBeenCalled()
  })
  it('does not dispatch to an unmounted editor', async () => {
    const { model, view } = editor('original')
    mocks.upload.mockImplementation(async () => {
      model.dom.isConnected = false
      return { url: 'https://images.example/image.png' }
    })
    await importFilesToEditor(view, [image()])
    expect(model.dispatch).not.toHaveBeenCalled()
  })
})
