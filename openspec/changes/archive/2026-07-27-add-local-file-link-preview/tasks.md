## 1. 跨进程契约与 API

- [x] 1.1 在 `src/shared/types/local-file-preview.ts` 定义 `LocalFilePreviewRequest`、`LocalFilePreviewDocument`、`LocalFilePreviewReadyResult`、`LocalFilePreviewConfirmationResult`、`LocalFilePreviewErrorResult` 与判别联合 `LocalFilePreviewResult`；字段覆盖 requested/canonical path、authorization ID、content、language、size、mtime、line/column 和稳定错误码，且 confirmation result 不允许包含 content。
- [x] 1.2 新增 `src/shared/ipc/workspace/document.channels.ts` 与 `document.schemas.ts`，定义 `WorkspaceDocumentChannels.preparePreview = "workspace:document:preparePreview"`、`confirmPreview = "workspace:document:confirmPreview"`，以及只接受 `{ requestedPath }`、`{ authorizationId, rememberForWindow }` 的 Zod 输入 schema；不得接受 renderer 提供的 projectId、webContentsId 或确认阶段新路径。
- [x] 1.3 新增 `src/preload/api/workspace/document.ts` 和 `src/renderer/src/api/workspace/document.ts`，并更新 `src/preload/index.ts`、`src/preload/index.d.ts`，通过 `window.api.workspace.document.preparePreview()` / `confirmPreview()` 暴露 domain-first API；在 `test/preload/api/workspace/document.spec.ts` 与 `test/preload/index.spec.ts` 验证 channel、参数和 namespace。

## 2. 主进程文件与可信根基础设施

- [x] 2.1 新增 `src/main/infra/git/worktree-reader.ts`，使用项目现有 `cross-spawn` 约定实现 `listRegisteredWorktreePaths(projectPath)`，解析 `git -C <projectPath> worktree list --porcelain` 的 `worktree` 行并返回 canonical paths；失败时返回安全降级结果而不扩大可信根，并在 `test/main/infra/git/worktree-reader.spec.ts` 覆盖 main/linked worktree、空输出和命令失败。
- [x] 2.2 新增 `src/main/infra/files/local-text-file.ts`，实现 `resolveLocalFileTarget(requestedPath)` 与 `readLocalTextFile(canonicalPath)`：先尝试完整文件名，再在完整路径不存在时解析末尾 `:line[:column]`；使用 `realpath`、file handle stat、5 MiB 读取前后上限、`isFile()`、NUL byte 检测和 fatal UTF-8 解码，接受并移除 UTF-8 BOM；在 `test/main/infra/files/local-text-file.spec.ts` 覆盖冒号数字文件名、定位后缀、目录/特殊文件、增长后超限、二进制、无效 UTF-8 和 BOM。

## 3. Workspace document service 与 IPC

- [x] 3.1 新增 `src/main/services/workspace/document/local-file-preview-service.ts`，实现可注入依赖的 `LocalFilePreviewService.preparePreview()`：组合 `resolveLocalFileTarget()`、项目 canonical root、`listRegisteredWorktreePaths()` 和 `path.relative()` containment；可信文件校验后直接返回 ready，外部文件只返回不含 content 的 confirmation-required，并覆盖项目内、registered worktree、symlink escape 和 worktree 探测失败测试于 `test/main/services/workspace/document/local-file-preview-service.spec.ts`。
- [x] 3.2 在同一 service 实现 `confirmPreview()`、`rememberedGrants: Map<number, Set<string>>` 与 `pendingAuthorizations`：authorization 使用 `crypto.randomUUID()`、绑定 webContentsId/projectId/canonicalPath/size/mtime/line/column、60 秒过期且一次尝试后失效；只有成功读取且 `rememberForWindow` 为 true 才记录 `{projectId}\0{canonicalPath}`，sender destroyed 时清理该窗口全部状态。
- [x] 3.3 扩充 `test/main/services/workspace/document/local-file-preview-service.spec.ts`，验证其他 sender 复用 token、过期 token、确认前 metadata 变化、读取失败不留 grant、仅打开一次再次确认、当前窗口信任直接重开、projectId 变化、symlink target 变化、sender destroyed cleanup，以及 remembered grant 仍重复执行文件类型/大小/编码校验。
- [x] 3.4 新增 `src/main/ipc/workspace/document.ts` 的 `registerDocumentHandlers()`，复用 `wrapHandler()`、`validate()`、`ProjectWindowManager.getContextByWebContents()` 与 project service，从 sender 解析 project context 后调用 service；接入 `src/main/ipc/workspace/index.ts`，并在 `test/main/ipc/workspace/document.spec.ts` 和 `test/main/ipc/index.spec.ts` 验证 project window、launcher/未知 sender、schema 拒绝和 handler 注册。

## 4. Renderer feature 模型与用例

- [x] 4.1 建立 `src/renderer/src/features/local-file-preview/` 及 `README.md`、`index.ts`；在 `model/local-file-link.ts` 实现 `parseLocalFileLink(href)`，只接受可安全 percent decode 的 POSIX absolute、Windows drive 和 UNC path，保留 raw requestedPath 并拒绝 relative、`file://`、http(s) 与其他 scheme；在 `test/renderer/src/features/local-file-preview/model/local-file-link.spec.ts` 覆盖空格编码、无效 percent encoding 和跨平台路径。
- [x] 4.2 在 `model/preview-state.ts`、`application/ports.ts` 与 `application/local-file-preview-controller.ts` 定义 idle/loading/confirmation-required/ready/error 状态和 `WorkspaceDocumentPreviewPort`，实现带 request generation 的 `open()`、`confirm({ rememberForWindow })`、`cancel()` 与 dispose；过期异步响应不得覆盖最新请求，并在 `test/renderer/src/features/local-file-preview/application/local-file-preview-controller.spec.ts` 覆盖状态迁移、两个确认选项和竞态。
- [x] 4.3 在 `integration/workspace-document-port.ts` 将 `src/renderer/src/api/workspace/document.ts` 适配为 application port；`ui` 和 `model` 不得直接访问 `window.api`，feature 的 `index.ts` 只导出 MarkStream 宿主所需的稳定 integration entry 和必要类型。

## 5. 全局 Slideover 与 Monaco

- [x] 5.1 新增 `ui/LocalFilePreviewSlideover.vue`，使用 Nuxt UI `USlideover` 和项目语义 token渲染 loading、confirmation-required、ready、error；确认态完整展示 canonical path，并提供 neutral“取消”、neutral“仅打开一次”和唯一 primary“打开并在此窗口中信任”，所有 icon-only action 具备 tooltip 或 `aria-label`。
- [x] 5.2 在 `LocalFilePreviewSlideover.vue` 仅对 ready 状态调用 `stream-monaco` 的 `useMonaco({ readOnly: true, MAX_HEIGHT: "100%" })` 与 `createEditor()`；启用行号、关闭 minimap、保留搜索/选择/复制、跟随当前 light/dark theme，并使用返回的 line/column 调用 editor position/reveal API；组件卸载和状态离开 ready 时必须调用 `cleanupEditor()`。
- [x] 5.3 新增 `integration/use-local-file-preview.ts`，复用 `useConfirmDialog.ts` 的调用时 `useOverlay()` 模式，使用 module-scope `activePreview` 与 generation 保证每个 Renderer Window 单实例；点击时才执行 `overlay.create(LocalFilePreviewSlideover, { destroyOnClose: true })`，关闭后清理 handle，不得修改 `App.vue`、页面 route 或创建 Pinia store。
- [x] 5.4 在 `test/renderer/src/features/local-file-preview/ui/local-file-preview-slideover.spec.ts` 与 `integration/use-local-file-preview.spec.ts` mock Nuxt UI overlay、workspace port 和 `stream-monaco`，验证空闲时无 overlay/editor、点击立即 loading、确认前三动作、两种 confirm payload、非 ready 不创建 editor、ready 后定位、关闭 cleanup、destroyOnClose 和并发请求只保留最新结果。

## 6. MarkStream 集成与回归验证

- [x] 6.1 新增 `ui/LocalFileLinkNode.vue` 与 `integration/markstream.ts`：组件接收 `markstream-vue` 的 `LinkNodeProps`，非本地候选直接渲染该包导出的默认 `LinkNode`，本地候选保持相同文本/title/focus/keyboard 语义并仅接管 activation 调用全局 `open()`；组件本身不得创建 overlay、Monaco 或文件读取 watcher。
- [x] 6.2 更新 `src/renderer/src/components/shared/MarkStream.vue` 的 scoped component registration，使每个 `custom-id` 始终注册 `link: LocalFileLinkNode`，并与当前按开关加入的 Fyllo Action/Signal mapping 一次性注册和卸载；没有 Action/Signal 时也必须注册 link，且不得增加新的 enable prop 或页面判断。
- [x] 6.3 新增 `test/renderer/src/components/markstream-local-file-preview.spec.ts`，验证 Chat 风格和普通文档风格 MarkStream 都注册同一 link override、嵌套/大量实例不创建 Slideover、absolute link 进入 preview、relative/file/http(s) 走默认 LinkNode，并回归 `test/renderer/src/components/fyllo-action-markstream.spec.ts` 与 Fyllo Signal MarkStream 测试，确保 scoped mapping 未互相覆盖。
- [x] 6.4 按 `guidelines/QualityGates.md` 运行受影响的 main/preload/renderer Vitest、`pnpm typecheck`、`pnpm lint` 与 `git diff --check`；人工检查浅色/深色、窄窗口/桌面窗口、超长 canonical path、5 MiB/编码错误、项目内直接打开、项目外两个授权动作和关闭后资源释放。
