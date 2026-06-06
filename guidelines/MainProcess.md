---
name: MainProcess
description: Electron 主进程的分层结构、依赖方向、生命周期和基础设施约束
keywords: [electron, main-process, ipc, services, infra]
---

# MainProcess

## Purpose

定义 `src/main/` 的五层结构、依赖方向、资源生命周期和主进程内的实现约束。任何涉及主进程 handler、service、domain、infra、进程治理或持久化路径的工作，都必须先阅读本文档。

## Applicability

- 适用于 `src/main/**`。
- 适用于主进程中的 `bootstrap/`、`ipc/`、`services/`、`domain/`、`infra/`、`types/`。
- 适用于通过 `@main/*` 引用主进程实现的测试代码。
- 不覆盖 preload bridge 暴露规则和 channel 语义细表；见 `guidelines/IPC.md`。

## Sources of Truth

- `src/main/**`
- `eslint.config.mjs`
- `src/main/ipc/_kit/**`
- `src/main/infra/paths/index.ts`
- `src/main/infra/storage/project-paths.ts`
- `src/main/infra/process/acp-process-pool.ts`
- `src/main/services/chat/session-registry.ts`
- `openspec/specs/main-process-layering/spec.md`
- `openspec/specs/ipc-request-response/spec.md`
- `openspec/specs/ipc-streaming/spec.md`
- `openspec/specs/logging/spec.md`
- `openspec/specs/bundled-mcp-servers/spec.md`

## Rules

- MUST: 将 `src/main/` 维持为 `bootstrap -> ipc -> services -> domain/infra` 的单向依赖结构，具体受 `eslint.config.mjs` 中的 `no-restricted-imports` 约束。
- MUST: 让 `ipc/` handler 只做三件事：`validate` 入参、调用 `services/`、返回结果；不得在 handler 中直接触碰 `fs`、`child_process`、路径拼接或复杂业务逻辑。
- MUST: 对请求响应型 handler 使用 `ipc/_kit/wrap-handler.ts`，对流式 handler 使用 `ipc/_kit/stream-channel.ts`；不得在业务 handler 中重复手写错误归一化或 MessagePort 生命周期守卫。
- MUST: 将业务编排写在 `services/`，将纯逻辑和解析器写在 `domain/`，将文件系统、路径、进程、日志、ID 生成等能力写在 `infra/`。
- MUST: 将持久化路径通过 `infra/paths` 与 `infra/storage/project-paths.ts` 提供的函数统一生成，不得在 service 或 handler 层手写 `join(...)` 拼装项目作用域目录。
- MUST: 将长期存活的子进程、定时器、watcher、registry 和其他资源注册到主进程 lifecycle/disposable 体系中，确保退出时能清理。
- MUST: 主进程中创建子进程时使用 `cross-spawn`，不得从 `child_process` / `node:child_process` 直接导入 `spawn` 或 `spawnSync`；该约束由 `eslint.config.mjs` 拦截。仅类型导入（如 `ChildProcessWithoutNullStreams`）可继续来自 `child_process`。
- MUST: 对会派生孙进程的子进程（典型如 ACP agent）启用进程组隔离，并在 dispose 阶段按整棵树清理：POSIX 平台 `spawn(..., { detached: true })` 让 child 成为 process group leader，dispose 时用 `process.kill(-pid, signal)` 对组发信号；Windows 平台不设置 `detached`，dispose 时改用 `taskkill /T /F` 递归杀树。直接对单个 child 调 `kill()` 不会传递到孙进程，会留下孤儿。
- MUST: 通过 `sessionRegistry` 管理活跃 ACP session，不得在各业务模块各自维护 `Map<string, AcpSession>`。
- MUST: 通过 `@main/infra/logger` 或渲染侧对应转发 logger 记录日志，不得在主进程内使用散落的 `console.log`。
- SHOULD: 让 `domain/` 保持可离线单测，不依赖 Electron、`@electron-toolkit/*`、`services/`、`ipc/` 或绝大多数 `infra/`。
- SHOULD: 让 `infra/` 只提供能力，不反向依赖 `services/` 或 `ipc/`。
- MAY: 在被 ESLint 白名单允许的历史目录中保留过渡实现，但若修改这些文件，应优先推动其回归分层规范。

## Examples

- Good: `src/main/ipc/chat.ts` 中先 `validate(streamMessageInputSchema, input)`，再调用 service/session 入口，而不是直接创建文件路径或子进程。
- Good: `src/main/services/proposal/**` 中编排 apply/archive 流程，`infra/storage/**` 只负责文件读写与序列化。
- Good: `src/main/infra/process/acp-process-pool.ts` 管理 ACP 子进程重试、give-up 状态和退出清理。
- Good: 使用 `cross-spawn` 启动 `npm`、`npx`、`uvx`、`git` 等外部命令，避免 Windows `.cmd` shim、PATHEXT 和参数转义差异泄漏到业务代码。
- Bad: 在 `ipc/*.ts` 里直接 `spawn(...)`、`fs.writeFile(...)` 或导入 `@main/infra/storage/*`。
- Bad: `import { spawn } from "child_process"` 后直接启动外部命令。
- Bad: 在 `services/` 中硬编码 `session-${Date.now()}`、`process.resourcesPath` 或项目数据目录字符串。

## Chat Session Probe

- `src/main/services/chat/session-probe-service.ts` 负责草稿态 ACP `newSession` 握手、`closeSession` 释放和草稿态 `session/set_config_option`；probe 是 `agentId` 维度的主进程纯内存资源，不写入 SessionMeta。
- `session-probe-registry.ts` 的 `takeFor(agentId, acpSessionId)` 是 promote 与 close 的唯一 consume 入口；`chat:stream:message` 只有在 `acpSessionId` 入参匹配 registry entry 时才把 probe 数据写入 SessionMeta，并构造 `AcpSession({ presetAcpSessionId })`。该写入与 `chat:createSession` 透传 probe 字段的写入互为幂等（值相同时只更新 `updatedAt`）：`createSession` 是首条消息阶段的优先写入路径，`takeFor` 是兜底。
- `chat-service.createSession` 在入参带 `configOptions` / `acpSessionId` 时直接把它们写入新 SessionMeta（`config_options` 走 `normalizeAcpSessionConfigOptions`），缺失则保持旧路径；`takeFor` 不参与该写入，仅在 stream 阶段消费 registry entry。
- `session-probe-bus.ts` 只广播 `{ agentId, snapshot }` 或 `{ agentId, snapshot: null }`；窗口发送逻辑留在 IPC 层的 `setupProbeBroadcast(mainWindow)`，service 层不得直接依赖 `BrowserWindow`。
- `acp-process-pool.ts` 的 agent unavailable 事件必须清理 probe registry 并广播 null snapshot；agent 已不可用时不得再调用 `closeSession`。

## Verification

- `pnpm lint`
- `pnpm typecheck`
- `pnpm vitest run test/main/**/*.{test,spec}.ts`
- `pnpm vitest run test/shared/**/*.{test,spec}.ts`
- 修改主进程 layering、path、process、ipc kit 相关代码时，重点检查 `eslint.config.mjs` 的限制是否仍与文档一致。

## Maintenance

- 当 `src/main/` 新增层、目录职责变化、ESLint layering 规则变化、session/process/path 基础设施重构时，必须更新本文档。
- 当新的 handler 模式、错误处理模式或生命周期治理方式成为仓库默认做法时，必须更新本文档中的 Rules 与 Examples。
- 如果主进程规则与 `IPC.md`、`Architecture.md` 出现边界重叠，应把 channel 契约保留在 `IPC.md`，把进程内部约束保留在本文档。
