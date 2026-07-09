## Why

FylloCode 当前的 IPC channel、preload API、main service、renderer API wrapper 和 store 大多按扁平 capability 分布，跨领域依赖需要靠人工理解路径和命名来判断所有权。随着 chat、proposal、lineage、task、integration、ACP agent 等能力继续交织，缺少统一领域边界会让新增功能更容易产生循环依赖、跨层直接调用和难以审查的 IPC contract。

本变更将结构迁移到 domain-first 架构，使跨进程 contract、主进程 service 边界和 renderer store 边界都能从路径与命名上直接看出领域归属，同时保持业务语义、持久化格式和现有用户流程不变。

## What Changes

- **BREAKING**：公开 preload API 从扁平形状迁移到 `window.api.<domain>.<area>.<action>()`，最终状态不保留 `window.api.chat`、`window.api.proposal`、`window.api.task`、`window.api.acpAgents` 等 flat root alias。
- **BREAKING**：IPC channel 字符串迁移到 `<domain>:<area>:<action>` 格式，例如 `chat:listSessions` 变为 `session:chat:listSessions`，`proposal:stageStream` 变为 `proposal:apply:stageStream`。
- 建立六个目标领域：`platform`、`workspace`、`session`、`proposal`、`insight`、`automation`。
- 将 shared IPC contracts、main IPC handlers、preload APIs、renderer API wrappers 按 domain/area 分组。
- 将 main services 按 domain 分组，但不要求与 public API area 一一同形；service 内部按主进程 use case、IO 能力和 infra 组合边界拆分。
- 将 renderer stores 按 domain 分组，但不要求与 main services 或 public API area 一一同形；store 按 UI state、页面 workflow 和复用边界建模。
- 将 `src/main/domain/**` pure helpers 重新映射到六领域 taxonomy，避免保留旧的 `acp/chat/lineage/workflow` taxonomy。
- 建立 `src/main/services/<domain>/_public` 作为唯一允许其他 service domain import 的跨领域 service 出口，并用 lint 约束阻止直接跨领域 import area/internal/facade 文件。
- 增加 lint 约束，阻止 renderer 非 wrapper 代码直接调用 `window.api`、阻止 renderer store 跨领域直接 import API wrapper、阻止 page/component 直接 import 无关领域 store。
- 保持业务逻辑语义不变：不改变 proposal apply/archive 流程、task/session/lineage 语义、stream/agent/workflow/integration 算法、页面默认/空/错误状态。
- 保持本地持久化兼容：storage path、JSON key 和 JSON schema 不因文件移动而改变；若实现发现无法保持兼容，必须停止并补充迁移设计。

## Capabilities

### New Capabilities

- `domain-architecture-contract`: 定义 domain-first 架构契约，包括 `window.api.<domain>.<area>` 公开形状、`<domain>:<area>:<action>` IPC channel 命名、六领域 taxonomy、service `_public` 跨领域入口、renderer store 边界和持久化兼容要求。

### Modified Capabilities

- `proposal-browser`: 将 active contract text 中的 proposal 列表 channel 从旧 `proposal:list` 更新为新 `proposal:browser:list`。
- `project-window`: 将 active contract text 中的 project-scoped chat probe event channel 从旧 `chat:probe:update` 更新为新 `session:chat:probe:update`。
- `project-overview`: 将 active contract text 中的 overview channel 从旧 `overview:getProjectOverview` 更新为新 `insight:overview:getProjectOverview`。

## Impact

- 受影响代码区域：`src/shared/**`、`src/main/ipc/**`、`src/main/services/**`、`src/main/domain/**`、`src/preload/**`、`src/renderer/src/api/**`、`src/renderer/src/stores/**`、`src/renderer/src/pages/**`、`src/renderer/src/components/**`、`test/**`、`eslint.config.mjs`、`guidelines/**/*.md`。
- 受影响 contract：preload `window.api` root shape、IPC channel string、main service 跨领域 import 规则、renderer store/API wrapper import 规则。
- 不应影响：磁盘持久化路径和格式、已有业务流程语义、用户可见页面默认/空/错误状态、项目窗口隔离语义、proposal/task/session/lineage 的业务结果。
