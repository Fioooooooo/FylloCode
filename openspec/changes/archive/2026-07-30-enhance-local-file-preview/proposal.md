## Why

本地文件预览目前使用只读 Monaco 展示全部文本。长行在窄 Slideover 中只能横向滚动，Markdown 文件也无法在不离开预览的情况下查看渲染结果，降低了阅读效率。

## What Changes

- 在本地文件预览 Slideover 的原文视图中增加“内容溢出 / 自动换行”显示切换；该切换只影响当前预览会话中的 Monaco 布局，不修改文件内容，也不持久化为应用设置。
- 当预览文件被识别为 Markdown 时，增加“原文 / MarkStream 预览”切换；默认保留原文视图，MarkStream 预览使用已存在的共享渲染组件。
- 扩展本地文件语言识别，使常见 Markdown 文件后缀均被标记为 `markdown`，从而可获得该预览模式。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `local-file-link-preview`: 为 ready 状态的本地文本预览增加原文换行控制，并为识别为 Markdown 的文件增加原文与 MarkStream 渲染预览切换。

## Impact

- `src/main/services/workspace/document/local-file-preview-service.ts` 的文件语言识别。
- `src/renderer/src/features/local-file-preview/ui/LocalFilePreviewSlideover.vue` 的 Slideover 工具栏、Monaco 选项和 Markdown 渲染挂载。
- 本地文件预览的 renderer/main 测试与现有 `local-file-link-preview` OpenSpec 规格。
- 复用现有 `src/renderer/src/components/shared/MarkStream.vue`，不新增 IPC、持久化格式或第三方依赖。
