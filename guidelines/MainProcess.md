---
name: MainProcess
description: Governs Electron main-process ownership, IPC handlers, service layering, infrastructure, domain purity, and bundled MCP servers.
keywords: [main, electron, ipc, services, infra, domain]
---

# MainProcess

## 概览

`src/main/` 负责 Electron 主进程启动、窗口生命周期、IPC handler、服务编排、基础设施能力和纯领域辅助逻辑。主进程内部按依赖方向分层：

- `src/main/bootstrap/` 处理 Electron app 生命周期和窗口创建。
- `src/main/ipc/` 注册 IPC handler，并统一做输入校验和响应包装。
- `src/main/services/` 编排用例，连接 IPC、domain 和 infra。
- `src/main/domain/` 存放纯领域知识和无副作用 helper。
- `src/main/infra/` 封装文件系统、路径、存储、进程、MCP、集成等操作系统或外部能力。
- `src/mcp-servers/` 存放内置 MCP server，不依赖 Electron 或 `src/main` 实现。

主进程业务目录按六个 domain 分组：`platform`、`workspace`、`session`、`proposal`、`insight`、`automation`。IPC handler、services 和 pure domain helpers 应使用这些 domain 作为第一层所有权边界。

证据：`src/main/bootstrap/index.ts`、`src/main/ipc/index.ts`、`src/main/services/**`、`src/main/domain/**`、`src/main/infra/**`、`src/mcp-servers/**`、`eslint.config.mjs`。

## 区域与所有权

| 目录 / 模块           | 负责内容                                                                                                                                                 | 关键入口                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/main/bootstrap/` | Electron app 生命周期、窗口创建、启动期 wiring                                                                                                           | `src/main/bootstrap/index.ts`, `src/main/bootstrap/window.ts`, `src/main/bootstrap/workspace-window-manager.ts` |
| `src/main/ipc/`       | IPC handler 注册、schema 校验、响应归一化；area handler 按 `src/main/ipc/<domain>/<area>.ts` 组织，domain registry 位于 `src/main/ipc/<domain>/index.ts` | `src/main/ipc/index.ts`, `src/main/ipc/_kit/**`                                                                 |
| `src/main/services/`  | 主进程用例编排，按 `src/main/services/<domain>/**` 组织                                                                                                  | `src/main/services/**`                                                                                          |
| `src/main/domain/`    | 纯领域知识和无副作用 helper，按 `src/main/domain/<domain>/**` 组织                                                                                       | `src/main/domain/**`                                                                                            |
| `src/main/infra/`     | 文件系统、进程、存储、MCP、路径和外部集成能力                                                                                                            | `src/main/infra/**`                                                                                             |
| `src/preload/`        | 对 renderer 安全暴露主进程能力                                                                                                                           | `src/preload/index.ts`, `src/preload/api/**`                                                                    |
| `src/shared/`         | 跨进程 channel、schema、类型、常量和错误契约，IPC contract 按 domain/area 组织                                                                           | `src/shared/ipc/**`                                                                                             |
| `src/mcp-servers/`    | 内置 MCP server                                                                                                                                          | `src/mcp-servers/**`                                                                                            |

## 边界

- MUST 让 Electron/Vite main 和 preload 入口与 `electron.vite.config.ts` 一致：main 从 `src/main/index.ts` 构建，preload 从 `src/preload/index.ts` 构建。证据：`electron.vite.config.ts`。
- MUST 让 `src/main/index.ts` 作为最小单实例门：该入口只静态依赖 Electron `app`，必须在加载 `@main/bootstrap` 前同步取得 `app.requestSingleInstanceLock()`；未取得锁的进程只请求退出，不得加载 bootstrap 或启动 app-data writer。持锁实例必须在动态加载 bootstrap 前监听 `second-instance`，并通过 `startApp()` 返回的 `PrimaryInstanceController` 请求窗口注意力；controller 必须等 migration、IPC/event 注册和首窗创建完成后再复用 `WorkspaceWindowManager.focusLastActiveWindow()` / `openLauncherWindow()`，不得绕过启动顺序直接操作 `BrowserWindow`。证据：`src/main/index.ts`、`src/main/bootstrap/index.ts`、`src/main/bootstrap/workspace-window-manager.ts`、`test/main/index.spec.ts`、`test/main/bootstrap/index.spec.ts`。
- MUST 让请求-响应型 IPC handler 通过 `_kit` 辅助函数完成校验和响应归一化。main handler 使用 shared zod schema 校验 renderer 原始输入，并通过 `wrapHandler` 返回 `IpcResponse<T>`。证据：`src/main/ipc/platform/settings.ts`、`src/main/ipc/_kit/schema.ts`、`src/main/ipc/_kit/wrap-handler.ts`、`src/shared/types/ipc.ts`。
- MUST 按 domain-first 跨进程路径新增 IPC 能力：在 `src/shared/ipc/<domain>/<area>.channels.ts` 定义 `<domain>:<area>:<action>` channel，在 `src/shared/ipc/<domain>/<area>.schemas.ts` 定义输入 schema，在 `src/main/ipc/<domain>/<area>.ts` 定义 handler，并接入 `src/main/ipc/<domain>/index.ts` domain registry；`src/main/ipc/index.ts` 只注册六个 domain registry。在 `src/preload/api/<domain>/<area>.ts`、`src/preload/index.ts` 和 `src/preload/index.d.ts` 暴露 `window.api.<domain>.<area>`；renderer 需要该 API 时，在 `src/renderer/src/api/<domain>/<area>.ts` 提供 wrapper。证据：`src/main/ipc/session/chat.ts`、`src/main/ipc/session/index.ts`、`src/main/ipc/index.ts`、`src/preload/api/session/chat.ts`、`src/renderer/src/api/session/chat.ts`、`src/shared/ipc/session/chat.channels.ts`。
- MUST 让 `BrowserWindow` 生命周期归 `src/main/bootstrap/window.ts` 和 `src/main/bootstrap/workspace-window-manager.ts` 所有。IPC 或 services 不应保存单个全局 Workspace 窗口引用；需要向 Workspace 窗口发送事件时，通过 `WorkspaceWindowManager.sendToWorkspace(workspaceId, ...)`，需要全局 fanout 时通过 `sendToAll(...)`。证据：`src/main/bootstrap/workspace-window-manager.ts`、`src/main/ipc/session/chat.ts`、`src/main/ipc/proposal/browser.ts`、`src/main/ipc/platform/acp-agents.ts`。
- MUST 将 launcher/workspace 窗口上下文作为显式 IPC 契约维护。新增 Workspace 窗口行为时，应通过 `WindowChannels`、`WindowContext` 和 `WorkspaceWindowManager.getContextByWebContents()` 建立 sender 到 `{ role, workspaceId }` 的映射，不要从 renderer 状态或 caller path 反推窗口归属。Workspace-scoped handler 必须使用 `requireWorkspaceSender()` 校验 caller 提交的 `workspaceId`。证据：`src/shared/types/window.ts`、`src/shared/ipc/workspace/window.channels.ts`、`src/main/ipc/workspace/window.ts`、`src/main/ipc/_kit/workspace-scope.ts`。
- MUST 让 `src/main/ipc/**` handler 通过 services 访问业务能力，不直接持有文件系统、路径、进程创建等 infra 细节；`src/main/ipc/_kit/**` 是 IPC 基础设施例外。现有 ESLint 规则已禁止 IPC 直接导入 `fs`、`path` 和 `child_process`。证据：`eslint.config.mjs`、`src/main/ipc/_kit/**`。
- MUST 让 `src/main/services/**` 作为主进程用例编排层。services 可以组合 `domain` 和 `infra`，但不要让 `infra` 反向依赖 services。证据：`eslint.config.mjs`、`src/main/services/automation/task/task-service.ts`、`src/main/infra/**`。
- MUST 让 ACP session-update 映射保持“Agent 无关基线 + 显式 Agent adapter”边界：`acp-mapper.ts` 只作为稳定 facade 和分发入口，内部实现统一收拢在无 `index.ts` 的 `acp-mapper/` 目录；公共字段提取归 `acp-mapper/update-normalizers.ts` / `acp-mapper/tool-call-mapper.ts`，依赖特定 Agent 元数据的 thought/tool-call 展示增强归 `acp-mapper/agent-adapters/**` 并通过 `registry.ts` 注册。adapter 不得复制完整协议映射或从 tool call 推导宿主工作流副作用，跨事件 tool-call 组装状态继续归 `MessageAssembler` 所有。证据：`src/main/services/session/chat/acp-mapper.ts`、`src/main/services/session/chat/acp-mapper/tool-call-mapper.ts`、`src/main/services/session/chat/acp-mapper/agent-adapters/types.ts`、`src/main/domain/session/chat/message-assembler.ts`、`test/main/services/session/chat/acp-mapper/agent-adapters/registry.spec.ts`。
- MUST 让 main service 跨 domain 调用只通过 `src/main/services/<target-domain>/_public` 进入；不得从另一个 domain import `src/main/services/<target-domain>/<area>/**`。`_public` 只能位于 domain 根级，禁止 area 级 `_public`，并且必须显式 export 稳定方法，禁止 `export *`。证据：`eslint.config.mjs`、`src/main/services/session/_public/index.ts`。
- MUST 将 `_public` 视为 lower-level capability 出口而不是默认 facade；domain 内部可以有 `area-facade.ts` 做完整业务编排，但跨 domain 仍必须通过根级 `_public` 暴露的窄方法进入。
- MUST 保持 storage-backed service 的磁盘 path、JSON key 和 schema 独立于文件目录移动；移动 service 文件时不得顺手改变持久化格式，除非对应 OpenSpec proposal 明确包含 migration。
- MUST 将 Workspace-owned durable data 统一放在 `workspaceDataDir(workspaceId)` 下；sessions、tasks、knowledge、lineage、workflows、integration、MCP events 与 apply runs 必须复用 `src/main/infra/storage/workspace-paths.ts`，不得接受 repository path 选择 app-data namespace。Repository reverse data 才使用 `folderDataDir(folderId)`。证据：`src/main/infra/storage/workspace-paths.ts`、`test/main/infra/storage/workspace-storage-inventory.spec.ts`。
- MUST 将 Workspace knowledge 放在 `knowledgeDir(workspaceId)` 下，并复用 `src/mcp-servers/fyllo-cortex/src/utils/knowledge.ts` 的扫描/序列化能力。Raw markdown review、browser index 和单条删除都属于 `insight:knowledge` area；删除只能接受 `knowledgeEntryNameSchema` 校验后的 name，并在 sender Workspace 校验后限制到该 Workspace knowledge 目录，不得暴露任意 path 删除。证据：`src/main/infra/storage/workspace-paths.ts`、`src/main/ipc/insight/knowledge.ts`、`src/main/services/insight/knowledge/knowledge-document-service.ts`。
- MUST 通过 `resolveWorkspace()` / `resolveRepositoryTarget()` 从 `workspaceId` 获取 repository cwd、Folder membership 和 registered worktree；normal runtime 不得用 path-derived ID、`encodeProjectPath()` 或 renderer 自报绝对 path 定位 Workspace。证据：`src/main/services/workspace/resolver/workspace-resolver.ts`、`src/main/migrations/legacy-project-path.ts`。
- MUST 使用 `ProposalRef { folderId, changeId }` 作为 proposal browser、status watcher、apply/archive IPC 与持久化 run 的完整身份；不得用裸 `changeId`、Workspace primary 或 caller absolute path 猜测 owner。新 apply/archive run 必须持久化 resolver 已验证的固定 `worktreePath`，每次 stage/archive activation 前重新验证该 Folder membership、registered worktree 与目标 change，并只向 Agent 提供 owner Folder 的 MCP descriptor；缺少 owner 的历史 run 可读取但不得继续执行。证据：`src/shared/types/proposal.ts`、`src/main/services/proposal/browser/proposal-service.ts`、`src/main/services/proposal/runtime/apply-run-service.ts`、`src/main/infra/storage/apply-run-store.ts`、`src/main/ipc/proposal/apply.ts`、`src/main/ipc/proposal/archive.ts`。
- MUST 将 Workspace 创建、成员编辑、soft delete 与 restore 编排收敛到 workspace lifecycle service；Folder 重定位与新 Folder identity 解析必须共享 Folder registry 的全局 mutation queue，并在写入前重新检查所有引用 Workspace 的路径与 runtime/session 引用。证据：`src/main/services/workspace/workspace/workspace-lifecycle-service.ts`、`src/main/services/workspace/folder/folder-registry-service.ts`、`src/main/services/workspace/workspace/workspace-reference-inspector.ts`。
- MUST 让永久 Workspace 清理遵循 meta-last：先持久化 `purging`，幂等删除 Workspace-owned data 与 window state，只在持久化 `legacyAppDataKey` 可证明归属时删除 legacy source，最后删除 Workspace meta；不得从当前 Folder path、workspaceId 或目录扫描猜测 legacy source。证据：`src/main/services/workspace/workspace/workspace-cleanup-service.ts`、`src/main/infra/storage/workspace-store.ts`、`src/main/migrations/legacy-project-store.ts`。
- MUST 保持 `src/main/domain/**` 纯净：不得依赖 Electron、Electron toolkit、services、infra、IPC、bootstrap、文件系统、路径、操作系统环境或进程创建。需要这些值时，从 services 或 infra 传入数据。证据：`eslint.config.mjs`、`src/main/domain/**`。
- MUST 保持 `src/main/infra/**` 不依赖 services 或 IPC。infra 可以使用 domain 的纯 helper，但不能编排业务用例。证据：`eslint.config.mjs`。
- MUST 使用 `cross-spawn` 创建进程，不得从 `child_process` value-import `spawn` 或 `spawnSync`。该要求由 `eslint.config.mjs` 强制执行。证据：`eslint.config.mjs`、`src/main/infra/process/**`。
- MUST 保持 `src/mcp-servers/**` 不依赖 Electron 或 `@main/*`；`src/mcp-servers/fyllo-specs/src/tools/**` 不直接 spawn 进程，也不直接导入 `@fission-ai/openspec`，而是通过 runtime 层。证据：`eslint.config.mjs`、`src/mcp-servers/fyllo-specs/src/runtime-openspec/**`。
- MUST 让全局 ACP Agent 连接预热归 main app lifecycle 所有，不得由 renderer 状态或新增 IPC 驱动。`bootstrapReady()` 只在 shell PATH、migration、handler/event 注册和首窗创建完成后，通过 warmup coordinator 持有的 `setImmediate` 在下一轮 event loop 启动预热，不等待 `did-finish-load` 或 Agent ready；安装成功、升级成功和 custom 配置保存成功由 main service 提交增量预热。Coordinator 必须在 ACP process pool 前 dispose，取消首次 Immediate 与未启动队列；process pool 在 shutdown 后拒绝新启动，并提供单 Agent intentional stop，供升级、卸载和 custom command/args/env 失效时在 mutation 前终止 ready、starting、restarting 状态且不广播 crash unavailable；全局 dispose 继续统一释放所有连接。证据：`src/main/bootstrap/index.ts`、`src/main/services/platform/acp-agent/connection-warmup.ts`、`src/main/services/platform/acp-agent/acp-agent-service.ts`、`src/main/infra/process/acp-process-pool.ts`。
- MUST 让 `src/main/infra/mcp/bundled-mcp-host.ts` 统一拥有 bundled MCP HTTP proxy、后端子进程、`name -> backendPort` 内存路由、仅供 proxy/backend 使用的内部 token、有限重启和 lifecycle 清理；ACP chat/probe 只能通过 `createBundledMcpActivation()` 获取绑定 Agent、Session、server allowlist 与不可变 Workspace v2 descriptor 的 HTTP/stdio spec，不得读取后端端口或内部 token。HTTP proxy 必须校验 per-activation capability、剥离 caller `Authorization` 与全部 `X-Fyllo-*` 后再注入内部认证和唯一 Workspace context；stdio 必须只接收 `FYLLO_WORKSPACE_JSON`。renderer window 启动不得等待 MCP readiness，首次门控只发生在 ACP lifecycle 请求前。`src/mcp-servers/**` 继续保持不依赖 Electron 或 `@main/*`，两种 transport 都必须通过 shared Workspace resolver 访问 Folder allowlist/data/event/session context，不得回退 `cwd`、legacy Project env/header 或按 HTTP 请求修改 `process.env`。证据：`src/main/infra/mcp/bundled-mcp-host.ts`、`src/main/infra/mcp/bundled-mcp-servers.ts`、`src/main/infra/mcp/mcp-access-grant-registry.ts`、`src/main/services/session/chat/acp-session.ts`、`src/main/services/session/chat/session-probe-service.ts`、`src/mcp-servers/shared/request-context.ts`、`src/mcp-servers/shared/workspace-context.ts`、`src/mcp-servers/shared/workspace-resolver.ts`。
- MUST 让每个通过 IPC 启动的 bundled MCP HTTP 子进程入口使用进程级 `AbortController` 统一处理 `SIGTERM`、`SIGINT` 和父进程 IPC `disconnect`；`disconnect` 必须触发 `controller.abort()`，HTTP 启动器必须响应该 signal 并关闭 listener，避免 detached 子进程在 Electron 主进程异常退出后成为孤儿进程。新增 bundled MCP server 时必须加入同一机制，并在 `test/mcp-servers/child-process-lifecycle.spec.ts` 增加对应入口覆盖。证据：`src/mcp-servers/fyllo-specs/src/index.ts`、`src/mcp-servers/fyllo-cortex/src/index.ts`、`src/mcp-servers/shared/http-server.ts`、`test/mcp-servers/child-process-lifecycle.spec.ts`。

## 验证

```bash
pnpm lint
pnpm typecheck:node
pnpm exec vitest run --project main
```

## 失效信号

- 当 `electron.vite.config.ts`、`tsconfig.node.json`、`eslint.config.mjs`、`src/main/**`、`src/preload/**`、`src/shared/ipc/**` 或 `src/mcp-servers/**` 发生变化时，重新检查本文档。
