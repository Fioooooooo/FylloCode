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

| 目录 / 模块           | 负责内容                                                                                                                                                 | 关键入口                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/main/bootstrap/` | Electron app 生命周期、窗口创建、启动期 wiring                                                                                                           | `src/main/bootstrap/index.ts`, `src/main/bootstrap/window.ts`, `src/main/bootstrap/project-window-manager.ts` |
| `src/main/ipc/`       | IPC handler 注册、schema 校验、响应归一化；area handler 按 `src/main/ipc/<domain>/<area>.ts` 组织，domain registry 位于 `src/main/ipc/<domain>/index.ts` | `src/main/ipc/index.ts`, `src/main/ipc/_kit/**`                                                               |
| `src/main/services/`  | 主进程用例编排，按 `src/main/services/<domain>/**` 组织                                                                                                  | `src/main/services/**`                                                                                        |
| `src/main/domain/`    | 纯领域知识和无副作用 helper，按 `src/main/domain/<domain>/**` 组织                                                                                       | `src/main/domain/**`                                                                                          |
| `src/main/infra/`     | 文件系统、进程、存储、MCP、路径和外部集成能力                                                                                                            | `src/main/infra/**`                                                                                           |
| `src/preload/`        | 对 renderer 安全暴露主进程能力                                                                                                                           | `src/preload/index.ts`, `src/preload/api/**`                                                                  |
| `src/shared/`         | 跨进程 channel、schema、类型、常量和错误契约，IPC contract 按 domain/area 组织                                                                           | `src/shared/ipc/**`                                                                                           |
| `src/mcp-servers/`    | 内置 MCP server                                                                                                                                          | `src/mcp-servers/**`                                                                                          |

## 边界

- MUST 让 Electron/Vite main 和 preload 入口与 `electron.vite.config.ts` 一致：main 从 `src/main/index.ts` 构建，preload 从 `src/preload/index.ts` 构建。证据：`electron.vite.config.ts`。
- MUST 让请求-响应型 IPC handler 通过 `_kit` 辅助函数完成校验和响应归一化。main handler 使用 shared zod schema 校验 renderer 原始输入，并通过 `wrapHandler` 返回 `IpcResponse<T>`。证据：`src/main/ipc/platform/settings.ts`、`src/main/ipc/_kit/schema.ts`、`src/main/ipc/_kit/wrap-handler.ts`、`src/shared/types/ipc.ts`。
- MUST 按 domain-first 跨进程路径新增 IPC 能力：在 `src/shared/ipc/<domain>/<area>.channels.ts` 定义 `<domain>:<area>:<action>` channel，在 `src/shared/ipc/<domain>/<area>.schemas.ts` 定义输入 schema，在 `src/main/ipc/<domain>/<area>.ts` 定义 handler，并接入 `src/main/ipc/<domain>/index.ts` domain registry；`src/main/ipc/index.ts` 只注册六个 domain registry。在 `src/preload/api/<domain>/<area>.ts`、`src/preload/index.ts` 和 `src/preload/index.d.ts` 暴露 `window.api.<domain>.<area>`；renderer 需要该 API 时，在 `src/renderer/src/api/<domain>/<area>.ts` 提供 wrapper。证据：`src/main/ipc/session/chat.ts`、`src/main/ipc/session/index.ts`、`src/main/ipc/index.ts`、`src/preload/api/session/chat.ts`、`src/renderer/src/api/session/chat.ts`、`src/shared/ipc/session/chat.channels.ts`。
- MUST 让 `BrowserWindow` 生命周期归 `src/main/bootstrap/window.ts` 和 `src/main/bootstrap/project-window-manager.ts` 所有。IPC 或 services 不应保存单个全局项目窗口引用；需要向项目窗口发送事件时，通过 `ProjectWindowManager.sendToProject(projectId, ...)`，需要全局 fanout 时通过 `sendToAll(...)`。证据：`src/main/bootstrap/project-window-manager.ts`、`src/main/ipc/session/chat.ts`、`src/main/ipc/proposal/browser.ts`、`src/main/ipc/platform/acp-agents.ts`。
- MUST 将 launcher/project 窗口上下文作为显式 IPC 契约维护。新增项目窗口行为时，应通过 `WindowChannels`、`WindowContext` 和 `ProjectWindowManager.getContextByWebContents()` 建立 sender 到窗口上下文的映射，不要从 renderer 状态反推窗口归属。证据：`src/shared/types/window.ts`、`src/shared/ipc/workspace/window.channels.ts`、`src/main/ipc/workspace/window.ts`。
- MUST 让 `src/main/ipc/**` handler 通过 services 访问业务能力，不直接持有文件系统、路径、进程创建等 infra 细节；`src/main/ipc/_kit/**` 是 IPC 基础设施例外。现有 ESLint 规则已禁止 IPC 直接导入 `fs`、`path` 和 `child_process`。证据：`eslint.config.mjs`、`src/main/ipc/_kit/**`。
- MUST 让 `src/main/services/**` 作为主进程用例编排层。services 可以组合 `domain` 和 `infra`，但不要让 `infra` 反向依赖 services。证据：`eslint.config.mjs`、`src/main/services/automation/task/task-service.ts`、`src/main/infra/**`。
- MUST 让 main service 跨 domain 调用只通过 `src/main/services/<target-domain>/_public` 进入；不得从另一个 domain import `src/main/services/<target-domain>/<area>/**`。`_public` 只能位于 domain 根级，禁止 area 级 `_public`，并且必须显式 export 稳定方法，禁止 `export *`。证据：`eslint.config.mjs`、`src/main/services/session/_public/index.ts`。
- MUST 将 `_public` 视为 lower-level capability 出口而不是默认 facade；domain 内部可以有 `area-facade.ts` 做完整业务编排，但跨 domain 仍必须通过根级 `_public` 暴露的窄方法进入。
- MUST 保持 storage-backed service 的磁盘 path、JSON key 和 schema 独立于文件目录移动；移动 service 文件时不得顺手改变持久化格式，除非对应 OpenSpec proposal 明确包含 migration。
- MUST 将项目级 durable knowledge 持久化放在 app data 的 `projectDir(projectPath)/knowledge` 下，由 `src/main/infra/storage/project-paths.ts` 提供路径约定，并复用 `src/mcp-servers/fyllo-cortex/src/utils/knowledge.ts` 的扫描/序列化能力。knowledge review 的 raw markdown 读取和保存 IPC 属于 `insight:knowledge` area，与 `insight:lineage` 平级；main 不在 `knowledge.review` 确认阶段执行 capture/update/retire operation。证据：`src/shared/ipc/insight/knowledge.channels.ts`、`src/main/ipc/insight/knowledge.ts`、`src/main/services/insight/knowledge/knowledge-document-service.ts`。
- MUST 保持 `src/main/domain/**` 纯净：不得依赖 Electron、Electron toolkit、services、infra、IPC、bootstrap、文件系统、路径、操作系统环境或进程创建。需要这些值时，从 services 或 infra 传入数据。证据：`eslint.config.mjs`、`src/main/domain/**`。
- MUST 保持 `src/main/infra/**` 不依赖 services 或 IPC。infra 可以使用 domain 的纯 helper，但不能编排业务用例。证据：`eslint.config.mjs`。
- MUST 使用 `cross-spawn` 创建进程，不得从 `child_process` value-import `spawn` 或 `spawnSync`。该要求由 `eslint.config.mjs` 强制执行。证据：`eslint.config.mjs`、`src/main/infra/process/**`。
- MUST 保持 `src/mcp-servers/**` 不依赖 Electron 或 `@main/*`；`src/mcp-servers/fyllo-specs/src/tools/**` 不直接 spawn 进程，也不直接导入 `@fission-ai/openspec`，而是通过 runtime 层。证据：`eslint.config.mjs`、`src/mcp-servers/fyllo-specs/src/runtime-openspec/**`。

## 验证

```bash
pnpm lint
pnpm typecheck:node
pnpm exec vitest run --project main
```

## 失效信号

- 当 `electron.vite.config.ts`、`tsconfig.node.json`、`eslint.config.mjs`、`src/main/**`、`src/preload/**`、`src/shared/ipc/**` 或 `src/mcp-servers/**` 发生变化时，重新检查本文档。
