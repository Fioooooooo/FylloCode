---
name: Architecture
description: FylloCode 的全局架构、目录边界与跨进程依赖方向
keywords: [architecture, electron, vue, layering, boundaries]
---

# Architecture

## Purpose

定义 FylloCode 的系统形状、顶层目录职责、跨进程边界与依赖方向。任何涉及目录归属、跨层调用、运行时职责拆分或新增模块落点的工作，都必须先阅读本文档。

## Applicability

- 适用于仓库根目录下的 `src/main/`、`src/preload/`、`src/renderer/`、`src/shared/`、`src/mcp-servers/`、`resources/`、`build/`、`test/`、`openspec/`。
- 适用于新增模块、迁移代码、跨进程共享类型、主进程与渲染进程协作、资源与构建产物的归属判断。
- 不覆盖进程内部的细节规则；主进程细节见 `guidelines/MainProcess.md`，渲染进程细节见 `guidelines/RendererProcess.md`，IPC 契约见 `guidelines/IPC.md`。

## Sources of Truth

- `AGENTS.md`
- `package.json`
- `electron.vite.config.ts`
- `electron-builder.yml`
- `tsconfig.node.json`
- `tsconfig.web.json`
- `src/main/**`
- `src/preload/**`
- `src/renderer/src/**`
- `src/shared/**`
- `src/mcp-servers/**`
- `openspec/specs/main-process-layering/spec.md`
- `openspec/specs/app-shell-routing/spec.md`
- `openspec/specs/ipc-protocol/spec.md`
- `openspec/specs/logging/spec.md`

## Rules

- MUST: 将 Electron API、Node.js 权限、窗口生命周期、文件系统访问、子进程管理限制在主进程与预加载脚本边界内；渲染进程不得直接访问这些能力。
- MUST: 将渲染进程视为 Vue 单页应用；UI、路由、状态、页面编排代码必须落在 `src/renderer/src/`。
- MUST: 将跨进程共享的类型、常量、schema 和错误对象放在 `src/shared/`，避免在 `src/main/`、`src/preload/` 和 `src/renderer/` 中各自维护一份相同契约。
- MUST: 将 ACP/MCP 服务器实现放在 `src/mcp-servers/`，不得依赖 Electron API 或 `@main/*` 别名。
- MUST: 将内置资源与模板放在 `resources/`，将打包配置与图标等构建素材放在 `build/`。
- MUST: 使用 `openspec/specs/` 作为功能需求与行为契约的权威来源；实现前先查相关 capability 的 `spec.md`。
- SHOULD: 在新增目录或模块前，先判断它是否已有明确归属；仅在现有边界无法容纳时才引入新顶层概念。
- SHOULD: 将跨层依赖保持单向，避免“页面直接调用 IPC”“handler 直接触文件系统”“渲染层导入主进程实现”等捷径。
- MAY: 在 `references/` 下维护专题参考资料，但这些资料不应替代顶层 guideline 的项目级规则。

## Examples

- Good: `src/renderer/src/api/project.ts` 作为渲染层调用 `window.api.project.*` 的薄封装，避免组件直接接触 preload bridge。
- Good: `src/shared/schemas/ipc/` 中集中维护 Zod 入参校验 schema，由主进程 handler 消费。
- Good: `src/mcp-servers/fyllo-specs/` 和 `src/mcp-servers/fyllo-skills/` 作为独立 Node 目标，通过 `scripts/build-mcp-servers.mjs` 构建到 `out/mcp-servers/`。
- Bad: 在 `src/renderer/src/components/**` 中直接访问 `ipcRenderer`、`fs`、`process.resourcesPath` 或 `@main/*`。
- Bad: 在 `src/main/services/**` 里硬编码 renderer 路由路径、Vue 组件名或浏览器 DOM 逻辑。

## Verification

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- 检查 `electron.vite.config.ts` 中 `main`、`preload`、`renderer` 三段 alias 与入口是否仍和目录结构一致。
- 检查新增共享契约是否落在 `src/shared/`，而不是重复出现在 `src/main/`、`src/preload/` 与 `src/renderer/` 两侧。

## Maintenance

- 当顶层目录职责、构建入口、跨进程边界、共享目录结构或 MCP server 布局变化时，必须更新本文档。
- 当新的 OpenSpec capability 改变系统边界时，先更新 `openspec/specs/*/spec.md`，再同步本文档。
- 如果 `AGENTS.md` 的项目概述或索引与本文档冲突，应以仓库事实为准并修复文档不一致。
