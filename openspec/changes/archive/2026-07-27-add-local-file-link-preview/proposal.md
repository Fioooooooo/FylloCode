## Why

Agent 回复以及 Specs、Guidelines、Knowledge、Proposal 等 Markdown 文档会包含本地文件链接，但当前 MarkStream 只能把它们渲染为普通链接，用户无法在 FylloCode 内快速核对文件内容。需要提供一个覆盖所有 MarkStream 宿主、不会随消息数量重复创建重型编辑器实例，并能安全查看项目外文件的统一预览能力。

## What Changes

- 所有 `MarkStream` 实例自动识别绝对本地文件链接，并通过全局单实例 Slideover 以只读 Monaco 展示文件内容；普通网络链接继续沿用 Markstream 默认行为。
- 项目根目录及其已注册 linked worktree 内的文件可直接预览；位于这些可信根之外的文件先显示完整 canonical path，再由用户选择“仅打开一次”或“打开并在此窗口中信任”。
- 主进程负责 canonical path、文件类型、大小、编码、可信根、临时授权及窗口级信任校验；renderer 不直接读取本地文件。
- 预览仅支持普通 UTF-8 / UTF-8 BOM 文本文件，文件大小上限为 5 MiB；目录、特殊文件、二进制或无效编码文件显示明确错误，且不提供绕过上限的操作。
- Slideover 在点击时按需创建，文件读取成功后才创建 Monaco；关闭时销毁 Monaco 和 overlay。一个 Renderer Window 同时只保留一个活动预览。
- 绝对路径可携带可选的 `:line[:column]` 定位信息；相对路径、`file://` 及其他 URI scheme 暂不拦截。

## Capabilities

### New Capabilities

- `local-file-link-preview`: 定义 MarkStream 本地文件链接识别、全局只读预览、可信根与项目外文件二次确认、窗口级授权、文件约束和错误状态。

### Modified Capabilities

无。

## Impact

- Renderer：`MarkStream` scoped link override、新的 `local-file-preview` feature、Nuxt UI 全局 Slideover 生命周期与 `stream-monaco` 只读展示。
- 跨进程契约：新增 `workspace:document:*` IPC channel、schema、preload API 和 renderer wrapper。
- Main：新增 workspace document preview service；复用 `ProjectWindowManager` 的 sender/project context，并维护按 `webContents.id` 隔离的内存授权。
- 测试：覆盖链接识别、全局 overlay 生命周期、Monaco 延迟创建、canonical path 与可信根判断、一次性/窗口级授权、文件约束及 IPC sender 隔离。
- 依赖：继续使用仓库已固定的 `markstream-vue@1.0.5`、`stream-monaco@0.0.46` 和现有 Monaco worker 配置，不新增运行时依赖。
