import { ClientOnly } from '@tanstack/react-router'
import { lazy, useEffect, useRef } from 'react'
import { usePreviewStore } from '@/stores/preview'
import { PreviewerFallback } from './fallback'
import MarkdownPreviewerSidebar from './sidebar'

const MarkdownRender = lazy(() => import('./render'))

export default function MarkdownPreviewer() {
  const containerRef = useRef<HTMLDivElement>(null)
  const previewWidth = usePreviewStore(state => state.previewWidth)
  const userPreferredWidth = usePreviewStore(state => state.userPreferredWidth)
  const setPreviewWidth = usePreviewStore(state => state.setPreviewWidth)

  useEffect(() => {
    const container = containerRef.current
    if (!container)
      return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      const width = entry?.contentRect.width
      if (!width)
        return

      if (userPreferredWidth !== previewWidth) {
        setPreviewWidth(userPreferredWidth)
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [setPreviewWidth, userPreferredWidth, previewWidth])

  return (
    <div className="flex h-full w-full overflow-hidden bg-editor">
      <div
        ref={containerRef}
        className="flex flex-1 items-center justify-center p-4"
      >
        <ClientOnly fallback={<PreviewerFallback />}>
          <MarkdownRender />
        </ClientOnly>
      </div>
      <MarkdownPreviewerSidebar />
    </div>
  )
}
