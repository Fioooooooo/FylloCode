# Stabilize Fyllo Action Architecture

## Why

当前 Fyllo Action 生命周期存在行为裂缝：状态模型没有 `ready`，应用重启后无法恢复未处理 Action；Renderer 通过 `setActionState` 向 Main 提交完整目标状态，缺少权威状态机和合法迁移检查；文件分散在 `src/shared/*` 和 `src/renderer/src/{config,utils,composables,components}` 多处，导致同一规则在 Inline、Rail、badge 中重复实现；执行副作用与状态同步耦合，重复操作可能重复创建 durable 业务对象。随着 Action 类型增加，这些裂缝会放大为跨模块的一致性和安全问题，因此需要在添加新 Action 类型前稳定架构。

## What Changes

- **新增 `ready` 状态与 `registerAction` IPC**：Markstream 解析到合法 ready Action 后，Renderer 立即通过 `session:action:registerAction` 向 Main 注册；Main 以 create-if-absent 方式写入 `ready` 状态，应用重启后可在未打开会话上恢复 attentionCount。
- **用命令式 `transitionAction` 替换 `setActionState`**：Renderer 不再提交完整目标状态，而是发送 `succeed` / `fail` / `cancel` 命令；`fail` 可携带可选 `error` 字符串并持久化到 `FylloActionState.error`；Main 负责状态机迁移、revision CAS 和 authoritative timestamp；新增批量 `transitionActions` 用于 knowledge.flag 等批量场景。
- **新增 `session-attention` 聚合层**：通过纯 selector `getSessionAttention` 和 composable `useSessionAttention(session)` 派生 attentionCount；当前 contributor 统计 persisted `ready` / `failed` 的 Fyllo Action，以及 assistant message 中已解析但尚未持久化的 pending `ready` Action；`SessionItem` 内部消费该派生值，不新增 `attentionCount` prop，也不维护可变提醒状态。
- **重组 Shared 契约**：将分散的 `src/shared/{types,schemas,constants,utils}/fyllo-action.*` 聚合为 `src/shared/fyllo-action/*`，按 protocol、schemas、registry、parser、identity、state、prompt 划分职责；registry 改为编译期穷尽 Record；prompt.ts 只负责把 registry 描述渲染为可直接注入 system-reminder 的静态字符串。
- **重组 Renderer feature**：按 `guidelines/RendererFeatures.md` 的四层语义建立 `src/renderer/src/features/fyllo-action/`，包含 model/application/ui/integration；拆分 `FylloActionShell` 与 execution controller；`model/pending-actions.ts` 只输出 feature-owned 纯投影，`integration/event-rail.ts` 负责转换为 EventRail contributor。
- **新增 Main Action service**：在 `src/main/services/session/action/` 建立 action-service、action-state-machine、action-execution-idempotency；Main 只负责幂等注册、状态迁移、安全校验和持久化，不解析 Markdown、不生成 Action ID、不引入 Markstream。
- **强化安全与持久化**：抽取 `safeSessionIdSchema`；IPC handler 从 sender/window context 校验 project ownership；`sessionId` 限制为安全路径段；Action state 持久化增加带 version 的 envelope；未知 Action type 在读取时被视为无效记录并丢弃。
- **改进 Prompt 与 system-reminder 可靠性**：动态字段尖括号编码，避免整份 reminder 被丢弃；空 knowledge index 仍输出固定 knowledge admission/flag 指令；knowledge.flag summary 拒绝 CR/LF；knowledge review autosave 处理 rejection 和 unmount flush。
- **执行一致性整改**：`task.create` 以 actionId 为幂等键；task store 加项目级队列锁和 temp-file + rename 原子写；knowledge.flag 在 durable append 成功后才能 batch succeed；状态同步失败时只重试 transition，不重跑副作用。

## Capabilities

### New Capabilities

- `fyllo-action-registration`：定义 Fyllo Action `ready` 状态、registerAction IPC、Main 幂等注册行为及持久化 envelope。
- `fyllo-action-transition`：定义命令式状态迁移、`succeed`/`fail`/`cancel` 命令、revision CAS、批量 `transitionActions` 及合法状态机。
- `session-attention`：定义会话提醒聚合接口、`useSessionAttention` 组件边界、SessionItem badge 展示规则及与 running pulse 的共存约束。
- `fyllo-action-prompt-contract`：定义 Fyllo Action prompt section 的生成规则、注入 system-reminder 的格式约束及 knowledge/system-reminder 安全编码规则。

### Modified Capabilities

- `fyllo-cortex-knowledge`：允许 `knowledge.flag` 和 `knowledge.review` 使用新的 `ready` actionStates；`knowledge.flag` 批量确认改为 `transitionActions` 原子更新；durable message append 成功后才能将 Action 标记为 succeeded。

## Impact

- **Shared**：新增 `src/shared/fyllo-action/` capability 目录；`src/shared/types/fyllo-action.ts`、`src/shared/schemas/fyllo-action.ts`、`src/shared/constants/fyllo-action-contracts.ts`、`src/shared/utils/fyllo-action.ts` 将被迁移或替换；新增 `session:action:*` IPC contract。
- **Main**：新增 `src/main/services/session/action/`；`src/main/services/session/chat/chat-service.ts` 中的 `setActionState` 逻辑迁移到 action service；`src/main/infra/storage/session-store.ts` 增加 Action state envelope 版本和 legacy decoder。
- **Renderer**：新增 `src/renderer/src/features/fyllo-action/`，session-attention 作为其内部公开能力；`src/renderer/src/config/fyllo-actions.ts`、`src/renderer/src/utils/fyllo-action.ts`、`src/renderer/src/utils/fyllo-action-rail.ts`、`src/renderer/src/composables/useFylloActionDispatcher.ts` 及相关 handler 迁移进 feature；`src/renderer/src/components/shared/markstream/FylloActionShell.vue`、`FylloActionNode.vue` 及 `src/renderer/src/components/shared/fyllo-action/*.vue` 按四层重组；`SessionItem` 内部使用 `useSessionAttention`。
- **Preload**：新增 `src/preload/api/session/action.ts` 暴露 `window.api.session.action.registerAction` / `transitionAction` / `transitionActions`。
- **System reminder**：`src/main/services/session/chat/system-reminder/providers/chat.ts` 注入 `fyllo-action-contract` section；`knowledge.ts` 改进字段编码和空 index 处理。
- **测试**：新增/迁移 `test/shared/fyllo-action/`、`test/main/services/session/action/`、`test/renderer/src/features/fyllo-action/`、`test/renderer/src/features/session-attention/` 的单元和集成测试。
