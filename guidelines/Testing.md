---
name: Testing
description: Governs Vitest projects, test locations, environments, and coverage thresholds.
keywords: [testing, vitest, coverage, renderer, main]
---

# Testing

## 范围

- 覆盖：`test/` 下的单元测试和集成风格测试、Vitest project 配置、测试环境和覆盖率门禁。
- 不覆盖：手动 Electron QA 或发布打包验证。

## 规则

- MUST 将测试放在生产源码之外，并在 `test/` 下镜像相关 `src/` 区域。domain-first 源码迁移时，测试也应跟随 `src/main/ipc/<domain>/<area>.ts`、`src/main/services/<domain>/<area>/**`、`src/main/domain/<domain>/<area>/**`、`src/preload/api/<domain>/<area>.ts`、`src/renderer/src/api/<domain>/<area>.ts` 和 `src/renderer/src/stores/<domain>/**` 的目录形状迁移。证据：`AGENTS.md`、`test/main/ipc/session/chat.spec.ts`、`test/main/services/proposal/browser/proposal-status-service.spec.ts`、`test/preload/api/session/chat.spec.ts`、`test/renderer/src/stores/session/session.spec.ts` 和 `vitest.config.mts`。
- MUST 使用 `.spec` 或 `.test` 扩展名命名测试文件，并匹配 `vitest.config.mts` 中的 Vitest include patterns。
- MUST 使用 `pnpm test` 运行完整测试套件；该命令映射到 `vitest run`。证据：`package.json`。
- MUST 将 renderer 测试保留在 `renderer` Vitest project 中，使用 `happy-dom`、启用 globals、加载 `test/renderer/src/setup.ts`，并包含 `test/renderer/src/**/*.{test,spec}.{ts,vue}` 下的测试。证据：`vitest.config.mts`。
- MUST 将 main/preload/shared/MCP 测试保留在 `main` Vitest project 中，使用 Node 环境、30s test 和 hook timeout、加载 `test/main/setup.ts`，并包含 `test/main`、`test/preload`、`test/mcp-servers` 和 `test/shared` 下的测试。证据：`vitest.config.mts`。
- SHOULD 使用 `git mv` 迁移测试文件，保留重构前后的文件历史；只有拆分或合并测试职责时才新增文件或删除旧文件。
- MUST 在单元测试中通过测试 setup 或聚焦测试 helper mock 依赖 Electron 的主进程能力，而不是启动真实应用。证据：`test/main/AGENTS.md`、`test/main/setup.ts`。
- MUST 将多窗口主进程行为测试放在对应 main 镜像目录：窗口生命周期和 `WorkspaceWindowManager` 放在 `test/main/bootstrap/`，窗口 IPC 放在 `test/main/ipc/`，窗口状态存储放在 `test/main/infra/storage/`。证据：`test/main/bootstrap/workspace-window-manager.spec.ts`、`test/main/ipc/workspace/window.spec.ts`、`test/main/infra/storage/window-state-store.spec.ts`。
- SHOULD 在 renderer store/component 测试中显式覆盖 launcher context、workspace context、`bound-current` 与 `created` / `focused-existing` 打开结果，避免组件绕过 window API 直接修改 `currentWorkspace`。证据：`test/renderer/src/stores/workspace/workspace.spec.ts`、`test/renderer/src/components/app-header.spec.ts`、`test/renderer/src/components/welcome-view.spec.ts`。
- MUST 为 Workspace cutover 保留分层测试：migration fixtures 覆盖 collision、partial target、数据转换与 legacy source 保留；bootstrap 测试覆盖 required gate 的无副作用失败路径；storage/window/renderer 测试覆盖相同 record ID 跨 Workspace 隔离和迟到响应隔离。证据：`test/main/migrations/scripts/project-to-workspace.spec.ts`、`test/main/bootstrap/index.spec.ts`、`test/main/infra/storage/workspace-storage-inventory.spec.ts`、`test/renderer/src/stores/workspace/workspace.spec.ts`。
- MUST 为 Workspace lifecycle 保留分层测试：domain 覆盖成员/path 纯规则，services 覆盖 create/edit/reference/relocation/cleanup 状态机，IPC 覆盖 window/runtime cleanup 顺序，renderer 覆盖 launcher 两类 identity、两阶段确认、deleted manager 与 navigation gate 一致性。证据：`test/main/domain/workspace/model.spec.ts`、`test/main/services/workspace/workspace/workspace-lifecycle-service.spec.ts`、`test/main/services/workspace/folder/folder-registry-service.spec.ts`、`test/main/ipc/workspace/workspace.spec.ts`、`test/renderer/src/components/workspace-launcher-lifecycle.spec.ts`。
- MUST 将 app startup/shutdown 顺序测试放在 `test/main/bootstrap/`：覆盖 first-visible barrier 前无重型工作、同窗 handoff、protected migration、phase 串并行、单一绝对 deadline、force pending/失败、重复 quit 与 Windows session-end。资源 owner 的 PID/process-group 和 graceful/force 行为放在对应 infra/service 镜像目录；`lifecycle-boundaries.spec.ts` 必须扫描并禁止 service/infra 通过 import side effect 注册全局顺序。Renderer 的 critical/background、无 Welcome flash、static startup 和 reduced-motion 放在 `test/renderer/src/`。证据：`test/main/bootstrap/shutdown.spec.ts`、`test/main/bootstrap/lifecycle-boundaries.spec.ts`、`test/main/infra/process/acp-process-pool.spec.ts`、`test/main/infra/mcp/bundled-mcp-host.spec.ts`、`test/renderer/src/app-startup.spec.ts`、`test/renderer/src/startup-page.spec.ts`。
- SHOULD 测试 renderer 组件状态和交互，而不是 @nuxt/ui 内部实现。现有 renderer 测试使用 `test/renderer/src/setup.ts` 为 UI 组件提供 stub。证据：`test/renderer/src/AGENTS.md`。
- MUST 保持覆盖率强制阈值非零。`vitest.config.mts` 要求 statements 50、branches 40、functions 50、lines 50；`pnpm test:coverage` 运行 `vitest run --coverage`。

## 验证

```bash
pnpm test
pnpm test:coverage
```

## 失效信号

- 当 `vitest.config.mts`、`package.json` 测试脚本、`test/main/AGENTS.md`、`test/renderer/src/AGENTS.md` 或测试目录布局发生变化时，重新检查本文档。
