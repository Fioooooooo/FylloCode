## Why

ACP 工具事件中的 `diff`、`locations` 和完整状态目前虽然部分进入了共享流事件，却会在消息组装或 Renderer 展示阶段丢失，导致实时视图、持久化历史和真实 Agent 执行结果不一致。同时消息只记录创建时间，缺少实际执行模型、effort 和最后更新时间，无法支撑后续审计与统计。

## What Changes

- 补齐 ACP tool call 的 `pending`、`in_progress`、`completed`、`failed` 四态归一化，保留 update 中“字段缺失”和“显式替换为空”的差异，并让失败工具以错误终态而不是成功输出终态进入消息。
- 将 tool call 的 `diff` 与 `locations` 按 ACP replacement 语义增量组装到工具消息中，使 Main 持久化结果、Renderer 实时结果和历史重载结果一致。
- 保留 Main 与 Renderer 两套 assembler 的现有生命周期边界和独立 message ID；抽取共享的纯工具事件归并规则，并以跨 assembler 契约测试约束一致性。Renderer 专属的 `liveOutput`、reasoning 展示状态和临时消息身份继续留在 Renderer。
- 在普通工具详情中展示明确的文字状态、失败信息、文件 diff 与 location；location 复用现有本地文件预览入口打开对应路径和行号。
- 为消息元数据增加 `updatedAt`、`model`、`effort`。模型与 effort 来自该轮 Prompt 实际 dispatch 时的配置快照，user 与 assistant 消息都保留同一轮快照；字段只用于持久化和数据消费，当前消息组件不展示它们。
- 兼容缺少新增元数据和新增工具字段的历史 JSONL 消息，不要求迁移或重写既有会话记录。
- 明确不改变 `usage_update`、`available_commands_update`、`config_option_update`、`plan`、`session_info_update` 与 `current_mode_update` 的现有策略，不新增每消息 Agent 字段，也不持久化 Renderer 专属运行时状态。

## Capabilities

### New Capabilities

- `acp-tool-event-fidelity`: 定义 ACP 工具状态、diff、location 从协议映射到共享事件、双 assembler、持久化和历史重载的一致性契约。
- `message-audit-metadata`: 定义消息 `updatedAt`、`model`、`effort` 的来源、更新时间语义、持久化和旧数据兼容行为。

### Modified Capabilities

- `assistant-activity-display`: 普通工具详情增加明确的四态/失败、diff 与 location 展示，同时保持 Activity group 的现有聚合和折叠行为。
- `local-file-link-preview`: ACP 工具 location 复用窗口级本地文件预览能力，并携带可用行号定位。

## Impact

- Shared contract：`src/shared/types/stream-event.ts`、`src/shared/types/chat.ts` 及工具消息元数据辅助类型。
- Main：`src/main/services/session/chat/acp-mapper/**`、`src/main/domain/session/chat/message-assembler.ts`、`src/main/services/session/chat/acp-stream-driver.ts`、`src/main/services/session/chat/chat-turn-service.ts` 与 session message JSONL 更新辅助逻辑。
- Renderer：`src/renderer/src/composables/useUIMessageAssembler.ts`、`src/renderer/src/stores/session/**`、`src/renderer/src/utils/chatTool.ts`、`src/renderer/src/components/chat/message/**`，以及本地文件预览公共入口的复用。
- Tests：Main/Renderer assembler 镜像契约、ACP mapper、消息存储兼容、Chat store 和工具组件测试。
- 不新增外部依赖，不同步 Main/Renderer message ID，不改变 session Agent 所有权或已开始会话不可更换 Agent 的约束。
