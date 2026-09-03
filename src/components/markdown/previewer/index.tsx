import { ClientOnly } from '@tanstack/react-router'
import { lazy } from 'react'
import { usePreviewStore } from '@/stores/preview'
import { PreviewerFallback } from './fallback'
import MarkdownPreviewerSidebar from './sidebar'
import { XhsPreview } from './xhs-preview'

const MarkdownRender = lazy(() => import('./render'))

export default function MarkdownPreviewer() {
  const previewMode = usePreviewStore(state => state.previewMode)

  return (
    <div className="flex h-full w-full overflow-hidden bg-editor">
      <div
        className={previewMode === 'xhs'
          ? 'flex min-w-0 flex-1 overflow-hidden'
          : 'flex flex-1 items-center justify-center p-4'}
      >
        {previewMode === 'xhs'
          ? (
              <ClientOnly fallback={<PreviewerFallback />}>
                <XhsPreview />
              </ClientOnly>
            )
          : (
              <ClientOnly fallback={<PreviewerFallback />}>
                <MarkdownRender />
              </ClientOnly>
            )}
      </div>
      <MarkdownPreviewerSidebar />
    </div>
  )
}
