# XHS Image Pagination Tolerance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让小红书正文页中的图片在轻微超出时以不低于 85% 的比例等比缩小并留在本页，明显超出时仍整块换页。

**Architecture:** 在 `src/lib/xhs/pagination.ts` 增加无 DOM 的缩放决策函数，集中表达 85% 下限和高度容差；`xhs-preview.tsx` 在现有逐块分页过程中只对可安全识别的图片块应用该决策，并把确定尺寸写入分页 HTML。预览和导出继续复用同一份 `XhsRenderedPage.html`，保证结果一致。

**Tech Stack:** TypeScript、React 19、Vitest、现有 DOM 测量与小红书分页管线

---

## 文件结构

- 修改 `src/lib/xhs/pagination.ts`：新增纯函数与返回类型，负责判断轻微超出的媒体是否应缩放。
- 修改 `src/lib/xhs/pagination.test.ts`：覆盖无需缩放、允许缩放、低于 85% 时拒绝缩放三个边界。
- 修改 `src/components/markdown/previewer/xhs-preview.tsx`：在现有块分页入口调用纯函数，并将可接受的图片尺寸约束写入该块 HTML。

### Task 1: 建立图片缩放决策边界

**Files:**
- Modify: `src/lib/xhs/pagination.ts`
- Test: `src/lib/xhs/pagination.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/lib/xhs/pagination.test.ts` 导入 `getMediaFitScale`，并加入以下用例：

```typescript
describe('getMediaFitScale', () => {
  it('keeps the original size when the block already fits', () => {
    expect(getMediaFitScale({
      availableHeight: 500,
      blockHeight: 480,
      mediaHeight: 300,
      tolerance: 45,
      minScale: 0.85,
    })).toBe(1)
  })

  it('returns a bounded scale when a media block only slightly exceeds the page', () => {
    expect(getMediaFitScale({
      availableHeight: 500,
      blockHeight: 560,
      mediaHeight: 400,
      tolerance: 45,
      minScale: 0.85,
    })).toBeCloseTo(0.9625)
  })

  it('rejects scaling when the media would need to shrink below the limit', () => {
    expect(getMediaFitScale({
      availableHeight: 300,
      blockHeight: 560,
      mediaHeight: 400,
      tolerance: 45,
      minScale: 0.85,
    })).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `bun run test src/lib/xhs/pagination.test.ts`

Expected: FAIL，提示 `getMediaFitScale` 尚未导出。

- [ ] **Step 3: 实现最小纯函数**

在 `src/lib/xhs/pagination.ts` 增加：

```typescript
export interface MediaFitOptions {
  availableHeight: number
  blockHeight: number
  mediaHeight: number
  tolerance: number
  minScale: number
}

export function getMediaFitScale({
  availableHeight,
  blockHeight,
  mediaHeight,
  tolerance,
  minScale,
}: MediaFitOptions): number | null {
  if (availableHeight <= 0 || blockHeight <= 0 || mediaHeight <= 0) {
    return null
  }

  if (blockHeight <= availableHeight + tolerance) {
    return 1
  }

  const nonMediaHeight = blockHeight - mediaHeight
  const targetMediaHeight = availableHeight + tolerance - nonMediaHeight
  const scale = Math.min(1, targetMediaHeight / mediaHeight)

  return scale >= minScale ? scale : null
}
```

- [ ] **Step 4: 运行相关测试并确认通过**

Run: `bun run test src/lib/xhs/pagination.test.ts`

Expected: PASS，分页原有用例和三个媒体缩放用例全部通过。

### Task 2: 将有限缩放接入正文分页

**Files:**
- Modify: `src/components/markdown/previewer/xhs-preview.tsx`
- Modify: `src/lib/xhs/pagination.test.ts`

- [ ] **Step 1: 增加常量与导入**

从 `@/lib/xhs/pagination` 导入 `getMediaFitScale`，并在现有分页常量旁增加：

```typescript
const XHS_MIN_MEDIA_FIT_SCALE = 0.85
```

- [ ] **Step 2: 增加只处理安全图片块的辅助函数**

在 DOM 测量辅助函数附近增加一个函数。它只接受内容块本身是 `img`、`figure` 内只有一张图片，或块内只有一张图片且没有其他媒体的情况；复杂块返回 `null`，继续走现有换页逻辑。

```typescript
function fitImageBlockToAvailableHeight(
  probe: HTMLElement,
  element: HTMLElement,
  currentHtml: string,
) {
  const image = element.matches('img')
    ? element as HTMLImageElement
    : element.querySelector<HTMLImageElement>('img')
  const mediaCount = element.querySelectorAll('img, video, svg, canvas, iframe').length

  if (!image || mediaCount > 1) {
    return null
  }

  const currentHeight = getArticleHeight(probe, currentHtml)
  const blockHeight = getArticleHeight(probe, element.outerHTML)
  const mediaHeight = image.getBoundingClientRect().height
  const scale = getMediaFitScale({
    availableHeight: XHS_USABLE_PAGE_HEIGHT - currentHeight,
    blockHeight,
    mediaHeight,
    tolerance: XHS_PAGE_HEIGHT_TOLERANCE,
    minScale: XHS_MIN_MEDIA_FIT_SCALE,
  })

  if (scale === null || scale === 1) {
    return scale === 1 ? element.outerHTML : null
  }

  const fitted = element.cloneNode(true) as HTMLElement
  const fittedImage = fitted.matches('img')
    ? fitted as HTMLImageElement
    : fitted.querySelector<HTMLImageElement>('img')
  if (!fittedImage) {
    return null
  }

  fittedImage.style.width = `${Math.round(image.getBoundingClientRect().width * scale)}px`
  fittedImage.style.height = 'auto'
  fittedImage.style.maxHeight = 'none'

  return fitted.outerHTML
}
```

实现时应使用测量容器中与 `element` 对应的实际图片高度；如果克隆节点的 `getBoundingClientRect()` 无法取得媒体高度，则在 probe 中临时渲染块后读取，不从 Markdown 猜测比例。

- [ ] **Step 3: 在换页前尝试有限缩放**

在 `pushElement` 构造的 `candidateHtml` 不适配当前页时，先调用辅助函数：

```typescript
const currentPageHtml = currentHtml.join('')
const candidateHtml = `${currentPageHtml}${element.outerHTML}`
if (currentHtml.length > 0 && !fitsPage(probe, candidateHtml)) {
  const fittedHtml = fitImageBlockToAvailableHeight(probe, element, currentPageHtml)
  if (fittedHtml) {
    currentHtml.push(fittedHtml)
    return
  }

  const trailingHeading = takeTrailingHeading()
  if (trailingHeading) {
    currentHtml = [trailingHeading]
  }
}
```

保留表格、代码块、标题配对、`normalizeOverflowPages` 和运行时溢出修复的既有逻辑。缩放后的 HTML 必须再次通过 `fitsPage`；不通过则返回 `null` 并换页。

- [ ] **Step 4: 运行定向验证**

Run: `bun run test src/lib/xhs/pagination.test.ts`

Expected: PASS。

Run: `bunx tsc --noEmit`

Expected: exit code 0。

### Task 3: 完整验证与人工检查

**Files:**
- Verify: `src/components/markdown/previewer/xhs-preview.tsx`
- Verify: `src/lib/xhs/pagination.ts`
- Verify: `src/lib/xhs/pagination.test.ts`

- [ ] **Step 1: 运行 lint**

Run: `bun run lint:fix`

Expected: exit code 0；检查 `git diff`，确认没有格式化无关文件。

- [ ] **Step 2: 运行完整测试**

Run: `bun run test`

Expected: 所有 Vitest 测试通过。

- [ ] **Step 3: 运行生产构建**

Run: `bun run build`

Expected: 构建成功；若仅由构建重写 `public/api/openapi.json`，恢复该生成噪音，不触碰用户已有改动。

- [ ] **Step 4: 浏览器检查两个边界样例**

启动 `bun run dev`，在小红书预览中检查：

1. 图片只超出当前页少量：图片完整留在本页，宽度不低于原显示宽度的 85%，底部无裁切。
2. 图片需要缩小超过 15%：图片保持正常尺寸并整体进入下一页。
3. 分别导出上述页面：导出页数、图片所在页和预览一致。

- [ ] **Step 5: 汇总改动而不提交用户文件**

Run: `git status --short`

Expected: 能区分本功能修改与任务开始前已经存在的工作区改动；除非用户明确要求，不创建包含其未提交文件的功能提交。
