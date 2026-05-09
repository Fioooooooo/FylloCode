## Context

当前 Chat 页面的 agent 选择器 (`ChatAgentSelect`) 仅在流式传输期间禁用 (`chatStatus === "streaming"`)，这意味着用户在会话已经开始后仍可切换 agent，破坏了 session 与 agent 的一对一语义。同时，`UIMessageList` 中 assistant 的头像固定使用 `/claude.webp`，无法反映实际处理消息的 ACP agent。

## Goals / Non-Goals

**Goals:**

- 一旦 session 开始（有消息记录），锁定 agent 选择器，防止切换
- 草稿态（无消息）仍允许自由切换 agent
- Chat 主区域 assistant 头像根据当前 session 的 agentId 动态显示对应 ACP agent 的 icon
- SidePanel 场景（proposal apply）保持现有行为，不显示 agent 头像

**Non-Goals:**

- 不修改 session 创建时 agentId 的继承逻辑（仍沿用 draftAgentId）
- 不修改 ACP agent icon 的缓存/加载机制
- 不引入新的 UI 样式差异化（仅替换头像数据源）

## Decisions

### 禁用条件基于 messages.length 而非 chatStatus

选择 `messages.length > 0` 作为禁用条件，而非扩展 `chatStatus` 状态机。

**理由：**

- `messages.length > 0` 直接表达"会话已开始"的语义，与业务规则对齐
- 避免引入新的 chatStatus 状态（如 `"locked"`），减少状态机复杂度
- 草稿态（`activeSession = null` 或 `messages.length = 0`）天然允许切换

**替代方案：** 新增 `"locked"` chatStatus — rejected，过度设计。

### UIMessageList 通过新增 agentId prop 获取头像

`UIMessageList` 新增可选 `agentId?: string` prop，组件内部通过 `useAcpAgentsStore` 解析对应的 icon URL。

**理由：**

- 保持组件自包含，调用方只需传入 agentId，无需关心 icon 解析逻辑
- 与现有 `type` prop 正交，不破坏 `type="side"` 的现有行为
- `agentId` 为可选，避免影响 `ProposalApplySidePanel` 等现有调用方

**替代方案：** 在 `ChatContainer` 中解析好 icon 再传入 — rejected，增加了调用方负担，且 `UChatMessages` 的 `assistant.avatar` 结构需要调用方组装。

### SidePanel 场景不显示 agent 头像

`type="side"` 时 `agentId` 不传或传空，assistant 头像保持 `undefined`（即不显示）。

**理由：**

- Proposal Apply 的 side panel 与特定 agent 的关联性不强，当前也无此需求
- 保持最小改动，避免副作用

## Risks / Trade-offs

- **[Risk]** `messages.length > 0` 在消息被删除后可能变为 0，但当前系统不支持删除单条消息，仅支持删除整个 session，因此实际上不会发生。
- **[Risk]** 如果 ACP agent icon 尚未加载完成（bootstrap 未完成），头像可能短暂显示默认图标。`icons` ref 是响应式的，加载完成后会自动更新。
- **[Risk]** `UIMessageList` 新增 prop 属于接口变更，但 `agentId` 为可选，不影响现有调用方 `ProposalApplySidePanel`。
