# 小红书封面自由画布设计

## 目标

为每篇 Markdown 文章提供独立的小红书封面编辑能力。用户在大尺寸弹窗中通过添加、编辑、拖动和缩放文字或图片完成封面，不需要理解图层面板或专业设计软件概念。封面以原生 `720 × 960` DOM 画布渲染，预览和 PNG 导出使用同一渲染结果。

第一阶段只实现封面自由画布。正文插图自由定位不在本阶段范围内。

## 产品范围

### 支持

- 固定 `720 × 960` 封面画布。
- 添加多个文字和图片元素。
- 单击选中、拖动移动、四角缩放。
- 图片始终保持原始宽高比。
- 双击文字进入就地编辑。
- 文字字体、字号、字重、颜色和对齐设置。
- 元素上移、下移和删除。
- 撤销、重做。
- 方向键微调位置，`Delete` 删除选中元素。
- 每篇文章独立保存。
- 首次打开时根据文章标题和首段生成默认封面。
- 当前文章删除时同步删除封面。
- 单张和批量导出均使用编辑后的封面。

### 不支持

- 元素旋转、多选和组合。
- 复杂图层面板。
- 自定义画布尺寸。
- 色块、线条、形状和模板市场。
- 正文插图自由定位。

## 编辑器布局

编辑器使用接近全屏的大尺寸弹窗，不设置左右侧栏。

顶部工具栏包含：添加文字、添加图片、撤销、重做和完成。画布居中显示。元素选中时，在元素附近显示紧凑浮动工具栏；未选中元素时不显示属性设置。

关闭弹窗时，如果存在未保存修改，需要确认是否放弃。点击完成后保存当前文档并关闭弹窗。

## 数据模型

```ts
interface XhsCoverDocument {
  version: 1
  width: 720
  height: 960
  elements: XhsCoverElement[]
}

interface XhsCoverElementBase {
  id: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
}

interface XhsCoverTextElement extends XhsCoverElementBase {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  color: string
  textAlign: 'left' | 'center' | 'right'
  lineHeight: number
}

interface XhsCoverImageElement extends XhsCoverElementBase {
  type: 'image'
  src: string
  aspectRatio: number
  alt: string
}
```

所有坐标和尺寸均使用最终导出画布像素，不引入第二套缩放坐标。界面预览只在画布最外层缩放。

## 存储

使用单独的 IndexedDB 封面存储，以现有 `activeFileId` 为键。封面 JSON 与 Markdown 内容解耦，避免污染文章文本和 preview localStorage。

图片读取为 data URL 后存入封面文档，使本地封面不依赖临时 Blob URL。读取时使用运行时校验；记录缺失时创建默认封面，记录损坏或版本未知时保留原记录并回退到默认封面。

## 默认封面

首次打开编辑器时读取文章第一个 H1；没有 H1 时读取第一个 H2；都没有时使用“未命名文章”。副标题读取第一个有效正文段落。默认生成两个可编辑文字元素，后续文章内容变化不会覆盖用户保存的封面。

## 交互边界

- 指针拖动使用 pointer capture，避免移出元素后丢失拖动状态。
- 移动和缩放结果限制在画布范围内。
- 图片缩放固定宽高比。
- 文字框允许调整宽度，高度根据内容重新计算。
- 历史记录只在一次完整操作结束时写入，避免每个 pointer move 都生成记录。
- 撤销和重做只存在于当前弹窗会话，保存最终文档。

## 组件边界

- `xhs-cover-editor.tsx`：弹窗、顶部工具栏、会话状态和保存流程。
- `xhs-cover-canvas.tsx`：画布渲染、选择、拖动和缩放。
- `xhs-cover-element-toolbar.tsx`：选中元素的轻量属性工具栏。
- `cover-document.ts`：类型、校验、默认封面和坐标限制。
- `cover-history.ts`：纯函数撤销/重做状态。
- `cover-storage.ts`：按文章 ID 读取、保存和删除。
- `xhs-preview.tsx`：加载封面、打开编辑器并将封面作为第一页渲染。

## 导出流程

封面编辑器和小红书预览共用 `XhsCoverCanvas` 的只读渲染模式。导出继续截取原生 `720 × 960` 页面，导出前等待字体和图片完成加载，不创建另一套封面 HTML。

## 错误处理

- 不支持或无法解码的图片显示错误提示，不创建元素。
- IndexedDB 不可用时保留当前会话内存数据并提示刷新会丢失。
- 存储失败时编辑器保持打开，不能错误显示为已保存。
- 图片加载失败时显示明确占位，但不破坏其他元素。

## 验证

- 默认封面生成与文本截取测试。
- 文档校验、未知版本和损坏数据恢复测试。
- IndexedDB 保存、读取和删除测试。
- 撤销、重做测试。
- 移动边界、图片等比例缩放和文字尺寸测试。
- 单张及批量导出使用同一封面文档的集成检查。
- TypeScript 检查和相关 Vitest；不使用 Playwright。

## 验收标准

- 用户不需要打开侧栏即可完成一个类似参考图的封面。
- 刷新或切换文章后封面正确恢复且不会串文档。
- 预览封面与导出的第一页在文字、图片、位置和尺寸上保持一致。
- 拖动和缩放不会越出画布，图片不会变形。
- 删除文章后不会残留对应封面数据。
