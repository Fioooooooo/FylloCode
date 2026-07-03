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

证据：`src/main/bootstrap/index.ts`、`src/main/ipc/index.ts`、`src/main/services/**`、`src/main/domain/**`、`src/main/infra/**`、`src/mcp-servers/**`、`eslint.config.mjs`。

## 区域与所有权

| 目录 / 模块           | 负责内容                                       | 关键入口                                                      |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| `src/main/bootstrap/` | Electron app 生命周期、窗口创建、启动期 wiring | `src/main/bootstrap/index.ts`, `src/main/bootstrap/window.ts` |
| `src/main/ipc/`       | IPC handler 注册、schema 校验、响应归一化      | `src/main/ipc/index.ts`, `src/main/ipc/_kit/**`               |
| `src/main/services/`  | 主进程用例编排                                 | `src/main/services/**`                                        |
| `src/main/domain/`    | 纯领域知识和无副作用 helper                    | `src/main/domain/**`                                          |
| `src/main/infra/`     | 文件系统、进程、存储、MCP、路径和外部集成能力  | `src/main/infra/**`                                           |
| `src/preload/`        | 对 renderer 安全暴露主进程能力                 | `src/preload/index.ts`, `src/preload/api/**`                  |
| `src/shared/`         | 跨进程 channel、schema、类型、常量和错误契约   | `src/shared/types/channels.ts`, `src/shared/schemas/ipc/**`   |
| `src/mcp-servers/`    | 内置 MCP server                                | `src/mcp-servers/**`                                          |

## 边界

- MUST 让 Electron/Vite main 和 preload 入口与 `electron.vite.config.ts` 一致：main 从 `src/main/index.ts` 构建，preload 从 `src/preload/index.ts` 构建。证据：`electron.vite.config.ts`。
- MUST 让请求-响应型 IPC handler 通过 `_kit` 辅助函数完成校验和响应归一化。main handler 使用 shared zod schema 校验 renderer 原始输入，并通过 `wrapHandler` 返回 `IpcResponse<T>`。证据：`src/main/ipc/settings.ts`、`src/main/ipc/_kit/schema.ts`、`src/main/ipc/_kit/wrap-handler.ts`、`src/shared/types/ipc.ts`。
- MUST 按既有跨进程路径新增 IPC 能力：在 `src/shared/types/channels.ts` 定义 channel 常量，在 `src/shared/schemas/ipc/<area>.ts` 定义输入 schema，在 `src/main/ipc/<area>.ts` 和 `src/main/ipc/index.ts` 注册 handler，在 `src/preload/api/<area>.ts`、`src/preload/index.ts` 和 `src/preload/index.d.ts` 暴露 preload API；当 renderer 代码需要该 API 时，还要配合 `guidelines/RendererProcess.md` 在 `src/renderer/src/api/<area>.ts` 提供 renderer wrapper。证据：`src/main/ipc/settings.ts`、`src/preload/api/settings.ts`、`src/renderer/src/api/settings.ts`、`src/shared/schemas/ipc/settings.ts`。
- MUST 让 `src/main/ipc/**` handler 通过 services 访问业务能力，不直接持有文件系统、路径、进程创建等 infra 细节；`src/main/ipc/_kit/**` 是 IPC 基础设施例外。现有 ESLint 规则已禁止 IPC 直接导入 `fs`、`path` 和 `child_process`。证据：`eslint.config.mjs`、`src/main/ipc/_kit/**`。
- MUST 让 `src/main/services/**` 作为主进程用例编排层。services 可以组合 `domain` 和 `infra`，但不要让 `infra` 反向依赖 services。证据：`eslint.config.mjs`、`src/main/services/task/task-service.ts`、`src/main/infra/**`。
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

- 当 `electron.vite.config.ts`、`tsconfig.node.json`、`eslint.config.mjs`、`src/main/**`、`src/preload/**`、`src/shared/types/channels.ts`、`src/shared/schemas/ipc/**` 或 `src/mcp-servers/**` 发生变化时，重新检查本文档。
