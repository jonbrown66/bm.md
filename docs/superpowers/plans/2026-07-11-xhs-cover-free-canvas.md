# Xiaohongshu Cover Free Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a simple, stable per-article Xiaohongshu cover editor for draggable/resizable text and image elements with exact preview/export parity.

**Architecture:** Store a versioned `720 × 960` cover document per `activeFileId` in a dedicated IndexedDB store. Render one DOM canvas component in editable and read-only modes so the modal, preview, and SnapDOM export share the same coordinate system and element markup.

**Tech Stack:** React 19, TypeScript, Base UI/shadcn dialog primitives, Zustand file state, IndexedDB via `idb`, Vitest, SnapDOM.

---

## File map

- Create `src/lib/xhs/cover-document.ts`: document types, validation, defaults, bounds and element operations.
- Create `src/lib/xhs/cover-document.test.ts`: domain tests.
- Create `src/lib/xhs/cover-history.ts`: undo/redo pure state.
- Create `src/lib/xhs/cover-history.test.ts`: history tests.
- Create `src/lib/xhs/cover-storage.ts`: IndexedDB persistence keyed by article ID.
- Create `src/lib/xhs/cover-storage.test.ts`: mocked persistence tests.
- Create `src/components/markdown/previewer/xhs-cover-canvas.tsx`: editable/read-only DOM canvas.
- Create `src/components/markdown/previewer/xhs-cover-element-toolbar.tsx`: compact selected-element controls.
- Create `src/components/markdown/previewer/xhs-cover-editor.tsx`: large modal, session history, image import and save flow.
- Modify `src/components/markdown/previewer/xhs-preview.tsx`: load the current cover, open editor, and render cover page from the document.
- Modify `src/stores/files.ts`: delete the matching cover when an article is deleted.

### Task 1: Cover document domain

**Files:**

- Create: `src/lib/xhs/cover-document.ts`
- Test: `src/lib/xhs/cover-document.test.ts`

- [ ] **Step 1: Write failing tests for defaults, validation and bounds**

```ts
import { describe, expect, it } from 'vitest'
import { clampCoverElement, createDefaultCoverDocument, parseCoverDocument } from './cover-document'

describe('xhs cover document', () => {
  it('creates editable title and subtitle layers from markdown', () => {
    const result = createDefaultCoverDocument('# Memdex\n\n每天拆解一个 AI 产品')
    expect(result.elements.map(element => element.type)).toEqual(['text', 'text'])
    expect(result.elements[0]).toMatchObject({ type: 'text', text: 'Memdex' })
  })

  it('rejects unknown document versions', () => {
    expect(parseCoverDocument({ version: 2, width: 720, height: 960, elements: [] })).toBeNull()
  })

  it('keeps elements inside the canvas', () => {
    const result = clampCoverElement({
      id: 'text-1',
      type: 'text',
      x: 700,
      y: 950,
      width: 200,
      height: 100,
      zIndex: 1,
      text: 'A',
      fontFamily: 'OPPO Sans',
      fontSize: 48,
      fontWeight: 700,
      color: '#000000',
      textAlign: 'left',
      lineHeight: 1.2,
    })
    expect(result.x).toBe(520)
    expect(result.y).toBe(860)
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `bun run test src/lib/xhs/cover-document.test.ts`

Expected: FAIL because `cover-document.ts` does not exist.

- [ ] **Step 3: Implement the versioned document and pure operations**

Define `XHS_COVER_WIDTH = 720`, `XHS_COVER_HEIGHT = 960`, discriminated `XhsCoverTextElement` and `XhsCoverImageElement` interfaces, `parseCoverDocument(value): XhsCoverDocument | null`, `createDefaultCoverDocument(markdown)`, `clampCoverElement(element)`, `updateCoverElement(document, id, patch)`, `removeCoverElement(document, id)`, and `moveCoverElement(document, id, direction)`.

Default title comes from the first H1, then H2, then `未命名文章`; subtitle comes from the first non-heading paragraph. Every returned document must be a new immutable object.

- [ ] **Step 4: Run the focused test**

Run: `bun run test src/lib/xhs/cover-document.test.ts`

Expected: PASS.

### Task 2: Undo and redo history

**Files:**

- Create: `src/lib/xhs/cover-history.ts`
- Test: `src/lib/xhs/cover-history.test.ts`

- [ ] **Step 1: Write failing history tests**

```ts
import { describe, expect, it } from 'vitest'
import { commitCoverHistory, createCoverHistory, redoCoverHistory, undoCoverHistory } from './cover-history'

describe('xhs cover history', () => {
  it('undoes and redoes committed documents', () => {
    const first = { version: 1 as const, width: 720 as const, height: 960 as const, elements: [] }
    const second = { ...first, elements: [{ id: 'x' }] } as never
    const committed = commitCoverHistory(createCoverHistory(first), second)
    expect(undoCoverHistory(committed).present).toEqual(first)
    expect(redoCoverHistory(undoCoverHistory(committed)).present).toEqual(second)
  })
})
```

- [ ] **Step 2: Run the test and verify failure**

Run: `bun run test src/lib/xhs/cover-history.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement bounded immutable history**

Expose `CoverHistory`, `createCoverHistory`, `commitCoverHistory`, `undoCoverHistory`, and `redoCoverHistory`. Limit `past` to 50 entries and clear `future` on a new commit. Pointer moves update a draft in the component and commit only on pointer up.

- [ ] **Step 4: Run focused tests**

Run: `bun run test src/lib/xhs/cover-history.test.ts`

Expected: PASS.

### Task 3: Per-article cover storage

**Files:**

- Create: `src/lib/xhs/cover-storage.ts`
- Test: `src/lib/xhs/cover-storage.test.ts`

- [ ] **Step 1: Write failing storage tests with an injected adapter**

Test that `saveCoverDocument('article-1', document)` and `getCoverDocument('article-1')` round-trip, invalid stored JSON returns `null`, and `deleteCoverDocument('article-1')` removes the record. Mock `idb.openDB` so tests do not require a browser database.

- [ ] **Step 2: Run the test and verify failure**

Run: `bun run test src/lib/xhs/cover-storage.test.ts`

Expected: FAIL because storage functions do not exist.

- [ ] **Step 3: Implement the storage boundary**

Use database name `bm.md.xhs-covers`, version `1`, object store `covers`, and records `{ id, document, updatedAt }`. Export `getCoverDocument`, `saveCoverDocument`, `deleteCoverDocument`, `isCoverStorageUnavailable`, and `getCoverStorageUnavailableReason`. Maintain an in-memory fallback map and parse every read through `parseCoverDocument`.

- [ ] **Step 4: Run focused tests**

Run: `bun run test src/lib/xhs/cover-storage.test.ts`

Expected: PASS.

### Task 4: Shared cover canvas

**Files:**

- Create: `src/components/markdown/previewer/xhs-cover-canvas.tsx`
- Create: `src/components/markdown/previewer/xhs-cover-element-toolbar.tsx`

- [ ] **Step 1: Implement read-only rendering first**

Create `XhsCoverCanvas` props:

```ts
interface XhsCoverCanvasProps {
  document: XhsCoverDocument
  editable?: boolean
  selectedElementId?: string | null
  onSelectedElementIdChange?: (id: string | null) => void
  onDocumentChange?: (document: XhsCoverDocument, commit: boolean) => void
}
```

Render a relative `720 × 960` root. Text elements use absolute DOM nodes with their stored typography. Image elements use absolute wrappers and `<img draggable={false}>` with `object-contain`. Read-only mode has no handles, toolbars, pointer handlers, or editing attributes.

- [ ] **Step 2: Add pointer-captured movement and resize**

On pointer down, store the pointer ID and starting element rectangle, call `setPointerCapture`, and apply clamped draft updates during pointer move. On pointer up, release capture and call `onDocumentChange(next, true)` once. Four corner handles resize images by `aspectRatio`; text handles change width and let height follow content.

- [ ] **Step 3: Add keyboard and inline text editing**

Canvas root handles `Delete`, arrow keys, and Escape. Double-clicking text enables `contentEditable`; blur commits the normalized text. Prevent canvas drag while editing text.

- [ ] **Step 4: Add the compact element toolbar**

For text expose font family, numeric font size, weight toggle, color input, alignment and delete. For images expose move forward, move backward and delete. Use existing Button/Select/Input components and icon-only button `aria-label` values.

### Task 5: Large modal editor

**Files:**

- Create: `src/components/markdown/previewer/xhs-cover-editor.tsx`

- [ ] **Step 1: Build the minimal modal shell**

Use the existing Dialog primitive with a near-full viewport content area. Top toolbar contains add text, add image, undo, redo, and 完成. Center the scaled cover canvas in an overflow container. Do not add sidebars or a permanent layer panel.

- [ ] **Step 2: Add text and image creation**

New text uses a centered `320 × 80` OPPO Sans element. Image input accepts `image/png,image/jpeg,image/webp,image/gif`; read with FileReader, decode with `new Image()`, calculate `aspectRatio`, and fit within `420 × 420` without enlargement. Invalid images show a Sonner error and do not modify history.

- [ ] **Step 3: Wire history, dirty state and save**

Create history when the dialog opens. Undo/redo use the pure history functions. `完成` awaits `saveCoverDocument(activeFileId, history.present)`; on failure keep the dialog open and show an error. Closing dirty state uses the existing AlertDialog to confirm discarding edits.

### Task 6: XHS preview and export integration

**Files:**

- Modify: `src/components/markdown/previewer/xhs-preview.tsx`
- Modify: `src/stores/files.ts`

- [ ] **Step 1: Load a cover per active article**

Read `activeFileId` from `useFilesStore`. On article change, call `getCoverDocument(activeFileId)`; if absent, call `createDefaultCoverDocument(content)`. Track loading state so an old article cover is never briefly rendered for the new article.

- [ ] **Step 2: Replace generated cover HTML**

Remove `createCoverHtml` and the cover HTML inserted through `pages.unshift`. Keep body pagination as HTML pages, then render `XhsCoverCanvas` as the first `XhsPage` child in both hidden export pages and visible previews. Add an “编辑封面” button to the cover preview hover controls.

- [ ] **Step 3: Save editor changes into preview immediately**

On successful editor save, set the loaded cover document and close the modal. The existing single-page and all-page export actions continue selecting `[data-xhs-export-page="true"]`, so no export-only cover branch is introduced.

- [ ] **Step 4: Delete cover data with article deletion**

In `deleteFile`, call `deleteCoverDocument(id)` alongside `deleteFileContent(id)`. Log storage failures without blocking article deletion.

### Task 7: Focused verification

**Files:**

- Modify tests only if failures reveal contract drift.

- [ ] **Step 1: Run focused cover tests**

Run: `bun run test src/lib/xhs/cover-document.test.ts src/lib/xhs/cover-history.test.ts src/lib/xhs/cover-storage.test.ts`

Expected: all tests pass.

- [ ] **Step 2: Run TypeScript**

Run: `bunx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 3: Run targeted lint**

Run: `bun run lint src/lib/xhs/cover-document.ts src/lib/xhs/cover-history.ts src/lib/xhs/cover-storage.ts src/components/markdown/previewer/xhs-cover-canvas.tsx src/components/markdown/previewer/xhs-cover-element-toolbar.tsx src/components/markdown/previewer/xhs-cover-editor.tsx src/components/markdown/previewer/xhs-preview.tsx src/stores/files.ts`

Expected: no errors. Existing unrelated warnings in `xhs-preview.tsx` may remain documented.

- [ ] **Step 4: Manual acceptance without Playwright**

Verify in the running app: create a cover, add text and an image, drag/resize, undo/redo, save, switch articles, return and confirm persistence, export page one, then delete the article and confirm its cover does not return.
