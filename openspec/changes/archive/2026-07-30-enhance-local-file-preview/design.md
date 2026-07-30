## Context

`LocalFilePreviewSlideover` 在文件读取完成后固定创建只读 `stream-monaco` 编辑器。该组件已经具备 Slideover 生命周期、Monaco 清理和主题同步；`LocalFilePreviewDocument.language` 由主进程 `local-file-preview-service.ts` 根据扩展名填充。共享 `MarkStream.vue` 已负责 Markdown 渲染、深层本地文件链接预览和自定义节点注册，因此不应在预览 feature 内复制渲染或链接逻辑。

本变更只影响已通过原有路径、大小和 UTF-8 校验并进入 `ready` 状态的文件。loading、项目外确认和错误状态继续使用轻量界面，不能提前创建 Monaco 或 MarkStream。

## Goals / Non-Goals

**Goals:**

- 让用户在原文视图中按需关闭或开启长行自动换行。
- 让所有已识别的 Markdown 文件能在同一 Slideover 中切换原文与 MarkStream 渲染预览，并默认显示原文。
- 保持既有文件授权、只读、源码行列定位、Slideover 单实例和资源清理契约。

**Non-Goals:**

- 不编辑、保存或格式化预览文件。
- 不将查看模式或换行偏好持久化到 Pinia、主进程或用户设置。
- 不为 MDX/任意纯文本内容引入新的语法解析或内容嗅探。
- 不新增 IPC、共享数据字段、第三方依赖或新的 renderer feature。

## Decisions

### 在 Slideover UI 内保存临时显示状态

`LocalFilePreviewSlideover.vue` 使用组件本地状态保存 `wordWrap` 和查看模式。它们在每次 overlay 销毁后自然恢复默认值：原文模式和“内容溢出”。原文模式下把 `wordWrap` 映射到 Monaco 的 `wordWrap: "off" | "on"` 选项；切换到渲染预览时先清理 Monaco，再切回原文时以当前换行值重新创建并定位编辑器。

选择组件本地状态而非 store 或 IPC，是因为偏好只影响当前临时 Slideover，现有全局单实例与 `destroyOnClose` 已准确表达其生命周期。将它做成持久化设置会无必要地扩展用户设置与跨进程契约。

### 以服务返回的 `language === "markdown"` 作为预览资格

Slideover 只在 ready document 的语言为 `markdown` 时显示“原文 / MarkStream 预览”控制；其他文本文件只显示原文和换行控制。主进程扩展 `languageByExtension`，将大小写不敏感的 `.md`、`.markdown`、`.mdown`、`.mkdn`、`.mkd`、`.mdwn`、`.mdtxt` 与 `.mdtext` 统一映射为 `markdown`。

通过已有 `language` 字段衔接可以避免增加 renderer 与主进程之间的新数据契约，也让 Monaco 语言和预览资格保持一致。仅依据文件扩展名而非内容嗅探，保持现有轻量、确定性的语言识别方式；MDX 不属于本次支持范围。

### 复用共享 MarkStream，而不是在 feature 内再次组装渲染器

渲染模式挂载 `@renderer/components/shared/MarkStream.vue`，向其传入当前文件内容、稳定且仅供预览使用的 custom id、`isStreaming=false` 和当前主题。保持 Actions 与 Signals 默认关闭；共享组件仍会注册本地链接 override，使 Markdown 内的绝对本地文件链接继续走原有的安全预览入口。

复用共享组件可让代码块、Mermaid、数学公式、链接与后续 MarkStream 修复在所有文档宿主中一致。直接调用 `markstream-vue` 会绕过这些已建立的集成行为。

## Risks / Trade-offs

- [Markdown 扩展名不等同于内容语义] → 仅对明确的常见 Markdown 后缀提供切换，未知扩展名继续作为纯文本预览；不会猜测或执行 MDX。
- [原文与渲染模式切换可能遗留 Monaco 实例] → 沿用 `editorGeneration` 竞态保护，在离开原文模式、文档变化和组件卸载时调用 `cleanupEditor`。
- [渲染预览内的链接可能打开另一份文件] → 复用全局单实例预览入口；现有 controller disposal 与 overlay 替换机制继续保证只有最新请求有效。
- [超长 Markdown 在渲染模式的布局] → 渲染容器采用现有 Slideover 的可滚动主体；仅 Monaco 原文模式提供换行控制。

## Migration Plan

本变更不需要数据迁移或发布顺序。部署后，新 Slideover 直接以原有原文、内容溢出模式打开；用户在当前会话内显式切换即可体验新能力。若出现渲染问题，可关闭 Slideover 或切回原文，文件内容与授权状态均不受影响。

## Open Questions

无。
