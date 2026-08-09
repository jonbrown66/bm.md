import type { XhsCoverDocument } from '@/lib/xhs/cover-document'
import { XHS_PAGE_HEIGHT, XHS_PAGE_WIDTH } from '@/lib/xhs/preview-layout'
import { getXhsPageBackground } from '@/lib/xhs/preview-style'
import { XhsCoverCanvas } from './xhs-cover-canvas'

export function XhsPage({
  html,
  coverDocument,
  markdownStyle,
  authorName,
  footerLabel,
  exportPage = false,
}: {
  html?: string
  coverDocument?: XhsCoverDocument
  markdownStyle: string
  authorName: string
  footerLabel: string
  exportPage?: boolean
}) {
  const pageBackground = getXhsPageBackground(markdownStyle)
  const normalizedAuthor = authorName.trim()
  const normalizedFooter = footerLabel.trim()

  return (
    <div
      data-xhs-export-page={exportPage ? 'true' : undefined}
      data-markdown-style={markdownStyle}
      className="xhs-page relative overflow-hidden text-black shadow-sm"
      style={{
        width: XHS_PAGE_WIDTH,
        height: XHS_PAGE_HEIGHT,
        background: pageBackground,
      }}
    >
      {coverDocument
        ? <XhsCoverCanvas document={coverDocument} />
        : (
            <div className="xhs-article xhs-page-article">
              <div
                id="bm-md"
                style={{ background: 'transparent', padding: 0, margin: 0, width: '100%', minHeight: 'auto' }}
                dangerouslySetInnerHTML={{ __html: html ?? '' }}
              />
            </div>
          )}
      {(normalizedAuthor || normalizedFooter) && (
        <>
          {/* 页脚上方的精致分割线 */}
          <div
            className="absolute right-10 left-10 border-t border-black/10"
            style={{ bottom: 54 }}
          />
          <div
            className={`
              pointer-events-none absolute right-10 bottom-7 left-10 flex
              items-end justify-between gap-6 text-[18px] leading-none
              tracking-wide text-black/45
            `}
          >
            <span className="min-w-0 truncate text-left">{normalizedAuthor}</span>
            <span className="min-w-0 truncate text-right">{normalizedFooter}</span>
          </div>
        </>
      )}
    </div>
  )
}
