export function formatXhsPageFooter(pageNumber: number, totalPages: number) {
  const normalizedTotal = Math.max(1, Math.trunc(totalPages))
  const normalizedPage = Math.min(
    Math.max(1, Math.trunc(pageNumber)),
    normalizedTotal,
  )
  const digits = Math.max(2, String(normalizedTotal).length)

  return `${String(normalizedPage).padStart(digits, '0')} / ${String(normalizedTotal).padStart(digits, '0')}`
}
