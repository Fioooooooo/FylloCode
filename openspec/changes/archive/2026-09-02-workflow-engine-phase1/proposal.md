# Workflow Engine Phase 1

## Why

当前仓库同时保留了按名称读取旧 YAML、以 `WorkflowStage` 驱动 Proposal stage-stream 的旧实现，而 Phase 1 设计已经收敛为以 `WorkflowDefinition`、独立 Run 快照和主进程状态机为核心的新 engine。旧 Proposal 运行入口在 renderer 中已经被 Chat 消息路径替代，继续保留旧 engine 会让两套状态、IPC 和持久化模型并存并产生错误的维护边界。

本变更按一次性替换处理：旧 workflow engine 没有真实用户，不做旧模板或旧运行记录的兼容读取；新的 v2 engine 成为唯一通用 workflow 执行实现。

## What Changes

- **BREAKING**：新增 Phase 1 Workflow Engine，以 `version: 2` 的手写 YAML 为定义输入，使用随机且与名称解耦的 `workflowId`，将定义和 Run 快照存储在 Workspace-owned 的 `workflows/<workflow-id>/` 目录中。
- **BREAKING**：删除旧的 `WorkflowStage`、`WorkflowStageType`、`WorkflowTemplate`、按名称 YAML loader、built-in workflow 初始化和旧模板编辑模型；定义合法性校验与 Phase 1 能力预检分离，未实现能力在创建 Run 前结构化拒绝。
- 新 engine 实现 `Agent(context: fresh, produces: freeform)`、`Action(op.type: exec)`、`Gate(type: human)`、Transition 和 `maxLoops`，并使用单文件原子 Run 快照、冻结的 `frozenDefinition` 和重启 reconcile 规则。
- 新增 `fyllo-workflow` HTTP-only bundled MCP server，提供 `list_workflows` 与 `trigger_workflow`；MCP host 改为 server-neutral RPC envelope/codec 注册，保留 `fyllo-spawn` 的既有协议行为。
- 新增 `automation:workflow-run:*` list/detail/decide/wake IPC 和独立的 Workflow Run renderer store/activity entry。Workflow fresh ACP session 可见但不进入 spawned-session 列表、计数、store 或通知语义。
- `/workflow` 页面保留为 Workspace workflow 资产编辑入口，但改为 v2 YAML 定义编辑；renderer 的 workflow API 可复用现有 `automation:workflow:*` domain 前缀，但其请求、响应和持久化语义整体替换为 v2 definition API，不保留旧 `WorkflowTemplate` 兼容层。列表中的每一项都来自当前 Workspace 的正式 definition，并按 `workflowId` 编辑和删除，不再区分 built-in/custom 或提供复制保存。
- **BREAKING**：移除 built-in workflow 模板的资源、复制和运行时初始化链路：删除 `resources/workflows/built-in/quick-apply.yaml`，删除从 packaged resources 读取并复制到全局 `data/workflows`/`userData/workflows` 的 loader、原子复制 helper、source 标记、只读保护和 `BUILT_IN_WORKFLOW` 错误语义。`electron-builder.yml` 不再需要为 workflow 模板提供分发/解包前提；保留 `resources/**` 的通用规则仅用于仍在使用的图标等非 workflow 资源，并验收最终包不含 workflow built-in asset。
- **BREAKING**：移除仅服务旧 `WorkflowStage` 的 Proposal Apply/Archive stage-stream IPC、preload/API wrapper、run store、run metadata、消息存储和 renderer side panel；保留 `fyllo-specs` 的 `apply-change`/`archive-change` MCP tools、Chat Event Rail 的文字消息入口、Proposal watcher/status push 与 Proposal owner/worktree 约束。
- Workflow engine 不调用 `SpawnedSessionManager.promptToAgent`，不写入 spawned-session store/notification/list；fresh workflow session 的 bundled MCP allowlist 固定为 `fyllo-specs` 与 `fyllo-cortex`，排除 `fyllo-spawn` 与 `fyllo-workflow`。
- 将 WorkflowEngine 的启动、parent session 删除取消、正常 shutdown、emergency shutdown 和 ACP/Action 子进程清理接入现有 bootstrap lifecycle；移除旧 built-in workflow 初始化对应的生命周期任务。
- 不提供旧 `workflow-name.yaml`、旧 `WorkflowStage`、旧 `apply-runs` 的双读、自动迁移或双 engine 过渡。旧文件可以留在磁盘上，但新 runtime 不得发现、读取或继续执行它们。

## Capabilities

### New Capabilities

- `workflow-engine`: Phase 1 v2 workflow definition、Run 状态机、Agent/Action/Gate 执行、冻结快照、并发归属与恢复生命周期。
- `workflow-run-inspection`: Workflow Run 的 Main→Renderer wake + pull 查询、人工决策 IPC、WorkflowRunActivityEntry 和 fresh session 可见性。
- `fyllo-workflow-mcp`: `fyllo-workflow` MCP server、server-neutral bundled MCP RPC、trusted caller 校验和 workflow fresh session 的最小权限 allowlist。

### Modified Capabilities

- `workspace-automation-storage`: 将 Workspace-owned workflow 从旧名称文件扩展为随机 ID definition 目录和 Run artifacts，并移除 built-in/legacy workflow runtime 依赖。
- `repository-owned-proposals`: Apply/Archive 继续使用 owner-qualified `ProposalRef` 和可信 target，但不再通过旧 Proposal stage-stream IPC 或 `WorkflowStage` run metadata 执行。
- `proposal-browser`: 详情页移除无真实调用方的旧运行历史/side panel 依赖；Chat Event Rail 和 Proposal watcher 继续承担 Apply/Archive 的入口与状态更新。

## Impact

- 主进程新增/调整 `src/main/domain/automation/workflow/**`、`src/main/services/automation/workflow/**`、`src/main/ipc/automation/**`、`src/main/infra/storage/**`、`src/main/infra/mcp/**`、`src/main/bootstrap/runtime.ts`、`src/main/bootstrap/shutdown.ts` 和 parent-session lifecycle wiring；同时移除 `resources/workflows/built-in/**`、全局 workflow staging 目录及其启动复制资源。
- Shared/preload/renderer contract 受影响：`src/shared/types/workflow.ts`、`src/shared/ipc/automation/**`、`src/preload/api/automation/**`、`src/preload/index.ts`、`src/preload/index.d.ts`、workflow 页面/store/API，以及新增的 workflow-run contract。
- Proposal 旧运行代码与测试将被删除或改写；`fyllo-specs` MCP Apply/Archive、`repository-owned-proposals` 的 owner/worktree 语义、Proposal watcher 和 Chat 消息契约保持有效。
- built-in loader、资源复制/打包测试、全局 `workflows` 路径、built-in source/read-only UI 及相关中英文文档会被删除或改写；旧 global workflow 文件不迁移、不删除，也不再被新 runtime 发现。
- Bundled MCP 构建 registry、host transport、RPC schemas 和 allowlist 会扩大到 `fyllo-workflow`，但不能复制一套 host/proxy/token/lifecycle 实现。
- 需要覆盖定义解析/预检、状态机迁移、原子快照/reconcile、MCP caller/allowlist、IPC 授权、wake + pull、fresh session 隔离、shutdown/parent deletion、旧链路不再注册以及 Proposal Chat 回归的 Main/renderer/shared 测试。
- 本变更只属于 `FylloCode` Folder；不包含其他 repository 的文件或独立 Proposal。
