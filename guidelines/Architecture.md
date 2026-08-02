---
name: Architecture
description: Governs the top-level Electron architecture, process split, source layout, and guideline routing.
keywords: [architecture, electron, process, layout, boundaries]
---

# Architecture

## 概览

FylloCode 是一个 Electron + Vue 3 + TypeScript 桌面应用。总体架构按 Electron 进程、跨进程契约和内置 MCP server 拆分；本文档只记录顶层边界和阅读入口，进程内部细节由更窄的 guideline 约束。

主要请求路径：

- Renderer UI 调用 `src/renderer/src/api/**` wrapper。
- Renderer wrapper 通过 `window.api` 调用 `src/preload/api/**` 暴露的 contextBridge API。
- Preload 通过 shared channel 调用 `src/main/ipc/**` handler。
- Main handler 编排 `src/main/services/**`，由 services 使用 `src/main/domain/**` 和 `src/main/infra/**`。
- 跨进程类型、channel、schema 和错误契约放在 `src/shared/**`。

domain-first 请求路径在跨进程 contract 上必须显式带 domain 和 area：

- `window.api.<domain>.<area>.<action>()` 是 renderer 可见的唯一 preload API 形状。
- IPC channel 使用 `<domain>:<area>:<action>`，stream port/cancel/event channel 也必须包含 domain 和 area。
- shared IPC contract 放在 `src/shared/ipc/<domain>/<area>.channels.ts` 与 `src/shared/ipc/<domain>/<area>.schemas.ts`。

当前产品领域固定为六个：`platform`、`workspace`、`session`、`proposal`、`insight`、`automation`。

正常运行期的工作上下文由稳定 `Workspace` identity 和 repository-owning `Folder` identity 分离表达：Workspace-owned session、task、knowledge、lineage 与运行记录按 `workspaceId` 落在 app data；repository path 只从 Workspace resolver 返回的 Folder/registered worktree 获得，不参与 ID 推导。legacy `Project` 类型和 path encoding 仅允许出现在 `20260802_001_project-to-workspace` cutover migration 输入中。证据：`src/shared/types/workspace.ts`、`src/main/services/workspace/resolver/workspace-resolver.ts`、`src/main/infra/storage/workspace-paths.ts`、`src/main/migrations/scripts/20260802_001_project-to-workspace.ts`。

证据：`AGENTS.md`、`electron.vite.config.ts`、`tsconfig.node.json`、`tsconfig.web.json`、`src/preload/index.ts`、`src/main/ipc/index.ts`。

## 区域与所有权

| 目录 / 模块        | 负责内容                                                                                           | 细节 guideline                  |
| ------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------- |
| `src/main/`        | Electron 主进程启动、IPC handler、服务、领域和基础设施                                             | `guidelines/MainProcess.md`     |
| `src/preload/`     | contextBridge API 暴露和 preload 类型声明                                                          | `guidelines/MainProcess.md`     |
| `src/renderer/`    | Vue renderer 应用、页面、store、组件和 renderer API                                                | `guidelines/RendererProcess.md` |
| `src/shared/`      | 跨进程 channel、schema、类型、常量和错误契约，IPC contract 按 domain/area 放在 `src/shared/ipc/**` | `guidelines/MainProcess.md`     |
| `src/mcp-servers/` | 内置 MCP server                                                                                    | `guidelines/MainProcess.md`     |
| `test/`            | 与 `src/` 镜像的测试                                                                               | `guidelines/Testing.md`         |
| `guidelines/`      | 项目工程约定                                                                                       | 本文档及各专题 guideline        |
| `openspec/specs/`  | 行为契约                                                                                           | OpenSpec specs                  |

## 边界

- MUST 保持 Electron/Vite 入口与 `electron.vite.config.ts` 一致：main 从 `src/main/index.ts` 构建，preload 从 `src/preload/index.ts` 构建，renderer 从 `src/renderer/index.html` 构建。
- MUST 在跨主要区域导入时使用已配置的 alias，避免深层相对路径穿透：`@main`、`@preload`、`@renderer`、`@shared` 和 `@test` 声明在 `tsconfig.node.json`、`tsconfig.web.json`、`electron.vite.config.ts` 和 `vitest.config.mts` 中。
- MUST 按专题读取更窄的 guideline：主进程、preload、IPC、services、domain、infra 和 MCP server 变更先读 `guidelines/MainProcess.md`；renderer 路由、store、bootstrap 和 API wrapper 变更先读 `guidelines/RendererProcess.md`；UI/UX 视觉和交互变更先读 `guidelines/UiDesign.md`。
- MUST 将行为契约变更交给 OpenSpec proposal，不在 guideline 中直接改写用户可见行为要求。证据：`openspec/specs/project-health/spec.md`、`openspec/specs/task-linked-conversations/spec.md`。
- MUST 将 domain taxonomy、IPC/preload public shape、持久化格式、用户可见默认/空/错误状态等行为契约变更放入 OpenSpec proposal；guideline 只记录已采纳的工程边界。
- MUST 让正常运行期跨进程 scope 使用 `workspaceId`，repository target 使用 resolver 校验后的 `folderId`/registered `worktreePath`；不得把绝对 path 当作 Workspace identity、storage namespace 或 renderer 自报授权。证据：`src/shared/types/workspace.ts`、`src/main/ipc/_kit/workspace-scope.ts`、`src/main/services/workspace/resolver/workspace-resolver.ts`。

## 失效信号

- 当顶层目录职责、Electron/Vite 入口、alias 配置、OpenSpec 行为契约位置或 guideline 划分方式发生变化时，重新检查本文档。
