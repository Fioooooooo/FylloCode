## Context

`src/renderer/src/components/shared/MarkStream.vue` 是 Chat、Specs、Guidelines、Knowledge、Proposal 及嵌套 Markdown 的共同渲染入口，并已经通过 `custom-id`、`setCustomComponents()` 和 `removeCustomComponents()` 管理 scoped component override。一轮长对话可能包含上百个 `MarkStream`，因此不能在每个实例内常驻 Slideover 或 Monaco。

Nuxt UI 的 `useOverlay()` 本身使用 `createSharedComposable` 维护当前 Renderer Window 的 overlay registry；`src/renderer/src/composables/useConfirmDialog.ts` 已采用“调用时 `overlay.create(..., { destroyOnClose: true })`”的生命周期。`markstream-vue@1.0.5` 导出默认 `LinkNode` 并允许 scoped `link` override；`stream-monaco@0.0.46` 已安装，Monaco workers 已在 `electron.vite.config.ts` 配置，`src/renderer/src/config/markstream.ts` 也会预加载代码块运行时。

本能力涉及任意本地路径读取，因此 renderer 只负责识别链接和展示状态；canonical path、项目窗口上下文、可信根、授权与文件内容读取必须由主进程拥有。

## Goals / Non-Goals

**Goals:**

- 让所有 `MarkStream` 宿主自动获得本地文件预览，不要求页面 wrapper、route 注册或 `App.vue` 常驻组件。
- 每个 Renderer Window 最多存在一个按需创建的 Slideover 和一个按需创建的 Monaco 实例。
- 项目及已注册 linked worktree 内文件直接预览，项目外文件通过明确的二次确认安全打开。
- 在当前 Renderer Window 生命周期内，可按 `{ projectId, canonicalPath }` 记住用户授予的外部文件信任。
- 通过主进程限制普通文本文件、5 MiB 上限和 UTF-8 编码，并防止 renderer 伪造 project scope 或确认其他窗口的授权。

**Non-Goals:**

- 不解析相对路径，也不定义 Specs、Guidelines、Knowledge 或 Proposal 各自的相对路径基准。
- 不拦截 `file://`、`http://`、`https://` 或其他 URI scheme。
- 不编辑、保存或回写文件，不提供 Diff，不启动外部编辑器。
- 不持久化外部路径信任，不跨 BrowserWindow、应用重启或项目切换复用信任。
- 不支持目录、设备、FIFO、socket、二进制文件、UTF-16 或 GBK。
- 不监听文件变化；每次成功打开得到一次快照。重新点击或显式重新加载会发起新的读取流程。

## Decisions

### 1. 在 MarkStream 内注册轻量 scoped link override

`MarkStream.vue` 将在现有 scoped component mapping 中始终加入 `link: LocalFileLinkNode`，Action 与 Signal 节点继续按各自开关加入同一 mapping。`LocalFileLinkNode.vue` 只执行纯链接分类：

- 安全执行 percent decoding；
- 识别 POSIX 绝对路径、Windows drive path 和 UNC path；
- 保留可选 `:line[:column]`；
- 对非候选链接直接渲染 `markstream-vue` 导出的默认 `LinkNode`；
- 对候选链接保留原有文字、title、可访问性和视觉表现，仅接管 click 并调用共享 `open()`。

这让所有当前和未来的 `MarkStream` 宿主自动接入，也避免在页面层增加明显 wrapper。相较于在 Chat 页面单独处理 click，本方案不会遗漏 Specs、Guidelines、Knowledge、Proposal 或嵌套 MarkStream。

### 2. Overlay 采用调用时创建、关闭时销毁

新增 `useLocalFilePreview()`，生命周期模仿 `useConfirmDialog.ts`：

- 调用 composable 时只取得 Nuxt UI 的共享 `useOverlay()` 和轻量 `open()`；
- module scope 保存当前窗口唯一的 `activePreview` 与请求 generation；
- 点击链接时才调用 `overlay.create(LocalFilePreviewSlideover, { destroyOnClose: true })`；
- 新请求会使旧 generation 失效，避免较慢响应覆盖较新的预览；
- Slideover 关闭后清空 active handle，组件卸载时调用 `cleanupEditor()`，Nuxt UI 随后销毁 overlay。

不在 `App.vue` 注册 runtime，也不在每个 `MarkStream` 创建 overlay 或 Monaco。module scope 天然按 Renderer bundle / BrowserWindow 隔离；Nuxt UI 的 overlay registry 已是 shared composable，因此无需新增 Pinia store或全局 Provider。

### 3. Slideover 使用显式状态机，Monaco 延迟到内容就绪

Feature 的 application controller 使用以下互斥状态：

```text
idle -> loading -> confirmation-required -> loading -> ready
                 \------------------------------> error
```

Slideover 先立即展示 loading。只有 `ready` 带回内容后，`LocalFilePreviewSlideover.vue` 才调用 `useMonaco({ readOnly: true, MAX_HEIGHT: "100%" })` 的 `createEditor()`；设置 line numbers、关闭 minimap、保留搜索/选择/复制，并根据当前主题使用现有 Vitesse light/dark theme。成功创建后按返回的 line/column 设置光标并居中 reveal。

这利用现有 worker/runtime 预加载，把用户感知延迟拆成即时面板反馈与后台读取/编辑器挂载。相较于为每条消息预建 editor，此方案避免上百个 MarkStream 带来的初始化和内存成本。

### 4. 新增 domain-first `workspace.document` 跨进程能力

跨进程契约放置如下：

- `src/shared/ipc/workspace/document.channels.ts`
- `src/shared/ipc/workspace/document.schemas.ts`
- `src/shared/types/local-file-preview.ts`
- `src/main/ipc/workspace/document.ts`
- `src/preload/api/workspace/document.ts`
- `src/renderer/src/api/workspace/document.ts`

公开方法为：

- `preparePreview({ requestedPath })`
- `confirmPreview({ authorizationId, rememberForWindow })`

Renderer 不传 `projectId` 或 `webContents.id`。IPC handler 必须通过 `ProjectWindowManager.getContextByWebContents(event.sender)` 取得 project window context，再从 project service 取得项目路径；launcher 或上下文缺失时返回受控错误。Channel 使用 `workspace:document:preparePreview` 与 `workspace:document:confirmPreview`。

返回值使用判别联合：

- `ready`：canonical path、content、language、size、mtime、line/column；
- `confirmation-required`：authorization ID、完整 canonical path、size、mtime、line/column，不含 content；
- `error`：稳定 error code、直接可展示的信息和可选 canonical path。

### 5. 主进程解析目标并只信任 canonical containment

`preparePreview` 在主进程执行以下顺序：

1. 对 decoded `requestedPath` 先按完整文件名执行存在性检查；
2. 仅当完整路径不存在时，才剥离末尾 `:line[:column]` 并重新检查，避免把真实名称如 `report:12` 误判为定位符；
3. 使用 `realpath` 得到目标 canonical path；
4. 使用项目 canonical path，以及 `git -C <projectPath> worktree list --porcelain` 返回的 registered worktree canonical paths，建立本次请求的可信根；
5. 使用 `path.relative(root, target)` 进行边界判断，禁止字符串前缀判断；项目内指向外部的 symlink 因 canonical target 在根外而需要确认。

Git worktree 枚举放在 `src/main/infra/git/worktree-reader.ts`，文件 stat/read/UTF-8 校验放在 `src/main/infra/files/local-text-file.ts`，业务编排与授权放在 `src/main/services/workspace/document/local-file-preview-service.ts`。若 worktree 枚举失败，只把项目 canonical path 视为可信根，不因探测失败扩大权限。

### 6. 外部授权是 sender-bound、单次且短期有效

Service 维护两组纯内存状态：

- `rememberedGrants: Map<webContentsId, Set<projectId + "\0" + canonicalPath>>`
- `pendingAuthorizations: Map<authorizationId, PendingAuthorization>`

`PendingAuthorization` 由 `crypto.randomUUID()` 生成，保存发起者 `webContents.id`、`projectId`、canonical path、line/column、size、mtime 和 60 秒过期时间。`confirmation-required` 阶段不得读取或返回文件内容。

确认 UI 提供三个动作：

- “取消”：关闭，不调用确认 IPC；
- “仅打开一次”：`rememberForWindow: false`；
- “打开并在此窗口中信任”：`rememberForWindow: true`，并作为唯一 primary action。

`confirmPreview` 只接受 authorization ID，不接受新路径；它必须校验 sender、project、过期时间和当前 canonical file metadata，随后使 token 失效。只有文件成功读取后，才为信任动作记录 grant；读取失败不得留下信任。仅打开一次不记录 grant，之后重新读取同一路径仍需确认。

Service 在某个 sender 首次使用时为 `event.sender` 注册一次 `destroyed` cleanup，清除该 `webContents.id` 的 grants 与 pending authorizations。Grant key 包含 `projectId`，所以同一 BrowserWindow 从 launcher 绑定到其他项目或项目上下文变化时不会复用旧授权。再次解析 symlink 得到不同 canonical path 时也不会命中旧 grant。

### 7. 文件资格在每次读取前重新验证

文件读取必须从 canonical path 打开并在读取前检查：

- `stat.isFile()` 为真；
- size 不超过 5 MiB；
- 实际读取长度仍不超过 5 MiB，防止 stat 后增长；
- 内容不包含 NUL byte；
- 使用 `TextDecoder("utf-8", { fatal: true })` 解码成功；UTF-8 BOM 可接受并从展示内容移除。

已记住的路径也必须重复执行类型、大小、编码和存在性校验。超限、目录/特殊文件、二进制、无效 UTF-8、文件不存在、权限不足、授权失效或文件在确认前变化都返回明确 `error`，不提供“仍然打开”绕过。

### 8. Feature 按四层组织并只暴露稳定入口

Renderer 文件放在：

```text
src/renderer/src/features/local-file-preview/
  model/
    local-file-link.ts
    preview-state.ts
  application/
    local-file-preview-controller.ts
    ports.ts
  ui/
    LocalFileLinkNode.vue
    LocalFilePreviewSlideover.vue
  integration/
    markstream.ts
    use-local-file-preview.ts
    workspace-document-port.ts
  index.ts
  README.md
```

`model` 只包含链接解析与状态类型；`application` 通过 consumer-owned port 编排 prepare/confirm；`ui` 只渲染状态并发出动作；`integration` 连接 Markstream、Nuxt UI overlay 与 renderer API wrapper。`MarkStream.vue` 只从 feature 的公开 integration 入口取得 `LocalFileLinkNode`，不导入内部层级。

## Risks / Trade-offs

- [Risk] 大文件会占用 IPC serialization 和 Monaco model 内存 → 读取前后都执行 5 MiB hard cap，并且一个窗口只允许一个 editor。
- [Risk] canonicalization 与确认之间文件可能变化 → pending authorization 绑定 canonical path 与 metadata，确认时重新校验；任何差异都作废 token。
- [Risk] 项目内 symlink 可能绕过目录边界 → 对目标和可信根都使用 `realpath`，只比较 canonical containment。
- [Risk] Windows drive/UNC 与 POSIX 语法不同 → renderer parser 分别覆盖三种绝对路径，主进程使用当前平台 `path` 语义并以跨平台单元测试锁定解析。
- [Risk] 每个 MarkStream 都注册 link override → override 组件保持无 editor、无 overlay、无 watcher 的轻量实现；重型资源只在 click 后创建。
- [Risk] `git worktree list` 失败时 linked worktree 被当成外部文件 → 安全降级为仅信任项目根，用户仍可通过二次确认打开。
- [Trade-off] 第一版不支持相对路径和非 UTF-8 文本 → 避免不同文档宿主的 base path 歧义，并保持读取边界可测试；后续若扩展需单独定义行为契约。

## Migration Plan

1. 先增加 shared contract、main service/infra、IPC、preload 与 renderer API，并以隔离测试锁定路径和授权边界。
2. 增加 Renderer feature、全局 overlay controller 和 Slideover；验证无 `App.vue` 注册且 Monaco 仅在 ready 后创建。
3. 最后把 scoped `link` override 合并进 `MarkStream.vue` 的现有 custom component registration，回归 Action、Signal 与普通外链行为。
4. 本变更没有持久化数据迁移；回滚时移除 link override 与新增 `workspace.document` area 即可，现有 Markdown 数据不受影响。

## Open Questions

无。相对路径、额外编码、文件监听和持久化授权均明确留待后续独立变更。
