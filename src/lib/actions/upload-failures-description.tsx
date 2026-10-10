export interface FailedUploadItem {
  oldUrl: string
  error?: string
}

function getUrlDisplayName(urlStr: string): string {
  try {
    const parsed = new URL(urlStr)
    const filename = parsed.pathname.split('/').filter(Boolean).pop()
    if (filename) {
      return decodeURIComponent(filename)
    }
    return parsed.hostname
  }
  catch {
    return urlStr
  }
}

export function UploadFailuresDescription({
  results,
}: {
  results: FailedUploadItem[]
}) {
  const displayFailures = results.slice(0, 3)
  const remainingCount = results.length - displayFailures.length

  return (
    <div className="mt-1.5 flex flex-col gap-1.5 text-xs">
      {displayFailures.map((failure) => {
        const reason = failure.error || '未知原因'
        const displayName = getUrlDisplayName(failure.oldUrl)
        return (
          <div
            key={failure.oldUrl}
            className={`
              flex flex-col gap-0.5 rounded border border-border/50 bg-muted/40
              px-2 py-1
            `}
          >
            <span className={`
              leading-tight font-medium break-words text-destructive
            `}
            >
              {reason}
            </span>
            <span
              className="truncate font-mono text-[11px] text-muted-foreground"
              title={failure.oldUrl}
            >
              {displayName}
            </span>
          </div>
        )
      })}
      {remainingCount > 0 && (
        <span className="text-[11px] text-muted-foreground">
          另有
          {' '}
          {remainingCount}
          {' '}
          张图片上传失败
        </span>
      )}
    </div>
  )
}
