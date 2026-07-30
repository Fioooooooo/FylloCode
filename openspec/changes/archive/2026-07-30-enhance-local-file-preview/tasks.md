## 1. Markdown 语言识别

- [x] 1.1 修改 `src/main/services/workspace/document/local-file-preview-service.ts` 中的 `languageByExtension`，将 `.md`、`.markdown`、`.mdown`、`.mkdn`、`.mkd`、`.mdwn`、`.mdtxt` 和 `.mdtext`（通过现有 lower-case 处理支持大小写变体）映射为 `markdown`，不改变其他扩展名的映射或 `plaintext` 回退。
- [x] 1.2 在 `test/main/services/workspace/document/local-file-preview-service.spec.ts` 为 `preparePreview`/ready document 增加表驱动断言，覆盖上述 Markdown 后缀的大小写变体，并断言未知后缀仍不会返回 `language: "markdown"`。

## 2. Slideover 查看模式与换行控制

- [x] 2.1 在 `src/renderer/src/features/local-file-preview/ui/LocalFilePreviewSlideover.vue` 为 ready 状态增加组件本地的“内容溢出 / 自动换行”显示状态，默认内容溢出；将其传给 Monaco 的 `wordWrap` 选项，并在用户切换时更新现有编辑器而不重新请求文件。
- [x] 2.2 在同一组件依据 `document.language === "markdown"` 显示“原文 / MarkStream 预览”切换，默认原文；渲染模式挂载 `@renderer/components/shared/MarkStream.vue`，传入当前 document content、专用稳定 id、`isStreaming=false` 与颜色主题，且不启用 Action/Signal。
- [x] 2.3 调整 `mountDocument` 相关 watcher 与 `editorGeneration` 清理流程：仅在 ready 原文模式创建 Monaco；切换到 MarkStream、切换文件或卸载时清理 editor；切回原文时恢复 document 的 line/column 定位和当前 word-wrap 选择。
- [x] 2.4 为 ready Slideover 工具栏使用现有 Nuxt UI 按钮语义与可访问标签；让渲染预览主体可滚动，确保非 Markdown 文件只显示原文与换行控制，不新增持久化状态、IPC 或文件写入。

## 3. Renderer 验证

- [x] 3.1 扩展 `test/renderer/src/features/local-file-preview/ui/local-file-preview-slideover.spec.ts`，断言默认长行模式使用 `wordWrap: "off"`、切换自动换行更新为 `wordWrap: "on"`，且关闭/重新挂载会回到默认内容溢出。
- [x] 3.2 在同一测试中 mock 共享 `MarkStream`，覆盖 Markdown 文件显示原文/预览控制、进入渲染模式时不保留 Monaco、切回原文恢复 line/column 与换行选择，以及非 Markdown 文件不渲染预览控制或 MarkStream。
- [x] 3.3 运行 `pnpm exec vitest run --project main`、`pnpm exec vitest run --project renderer` 和 `pnpm typecheck`，修复本变更引入的失败。
