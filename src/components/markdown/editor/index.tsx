import { ClientOnly } from '@tanstack/react-router'
import { lazy } from 'react'
import { FileTabs } from '@/components/file-tabs'
import { EditorFallback } from './fallback'

const CodeMirrorEditor = lazy(() => import('./editor'))

export default function MarkdownEditor() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-editor">
      <FileTabs />
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <ClientOnly fallback={<EditorFallback />}>
          <CodeMirrorEditor />
        </ClientOnly>
      </div>
    </div>
  )
}
