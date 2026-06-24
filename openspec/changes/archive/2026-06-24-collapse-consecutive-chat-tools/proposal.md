## Why

当前 Chat assistant 消息中的每个工具调用都会单独渲染为一个 `UChatTool`，当 agent 连续读取、搜索、写入多个文件时，消息流会被大量工具卡片撑开，用户需要滚动穿过细节才能看到后续回复。ACP 已经提供工具类别字段 `kind`，FylloCode 的流式事件中也已透传为 `toolKind`，但组装成 AI SDK `dynamic-tool` part 后没有保留，导致前端无法稳定生成工具调用概况。

本变更将连续工具调用收敛为可展开的折叠面板，并让新消息把 `toolKind` 保存在 `dynamic-tool.toolMetadata.toolKind` 中；历史消息缺少该 metadata 时仍可折叠，只把概况降级为 `Run x tools`。

## What Changes

- Assistant 消息中相邻的两个及以上 tool part SHALL 合并渲染为一个可展开的工具组；两个 tool part 之间出现 text、reasoning、file、data 或其他非 tool part 时 SHALL 断开分组。
- 工具组折叠态文案 SHALL 按 `toolMetadata.toolKind` 统计，例如 `Read 1 file, Write 1 file`；缺少或未知 kind 的工具统一按 `Run x tool(s)` 展示。
- 工具组展开后 SHALL 复用现有单个 `UChatTool` 展示，每个工具的 text、suffix、output 与当前行为保持一致。
- 主进程 `MessageAssembler` 与渲染进程 `useUIMessageAssembler` SHALL 在创建和更新 `dynamic-tool` part 时保留 `toolMetadata.toolKind`，供新消息持久化和流式渲染消费。
- 历史 `.messages.jsonl` 不做迁移；历史 `dynamic-tool` part 没有 `toolMetadata.toolKind` 时只影响概况精度，不影响折叠和展开细节。
- Fyllo action 的 `partIndex` 语义 SHALL 保持原始 `message.parts` 下标，工具分组不得改写 `message.parts` 或使用渲染组下标替代原始 part index。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `chat-interface`: assistant 连续工具调用的折叠展示、概况文案、展开细节和 Fyllo action partIndex 不变约束。
- `acp-chat-backend`: ACP `toolKind` 在主进程/渲染进程组装为 AI SDK `dynamic-tool` part 时写入并保留到 `toolMetadata.toolKind`。

## Impact

- 主要影响渲染层：
  - `src/renderer/src/components/chat/message/AssistantMessage.vue`
  - `src/renderer/src/utils/chatTool.ts`
  - 新增或扩展 chat tool 分组/概况工具与对应测试
- 影响消息组装与持久化：
  - `src/main/domain/chat/message-assembler.ts`
  - `src/renderer/src/composables/useUIMessageAssembler.ts`
  - `sessions/*.messages.jsonl`、`stage-*.messages.jsonl`、`archive.messages.jsonl` 中新生成的 assistant `dynamic-tool` part 会多一个可选 `toolMetadata.toolKind`
- 测试影响：
  - 主进程 assembler 单测
  - 渲染进程 assembler 单测
  - assistant 消息/tool group 组件或 util 单测
- 文档影响：
  - 若实现确认新增 `dynamic-tool.toolMetadata.toolKind` 作为持久化约定，需要同步更新 `guidelines/DataModel.md` 的 Chat 消息持久化说明。
