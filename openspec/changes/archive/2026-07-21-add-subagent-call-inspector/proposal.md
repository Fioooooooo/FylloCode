## Why

Claude Code ACP 已经把子 Agent 工具与其内部工具调用的父子关系送达 renderer，但聊天界面仍将它们作为普通工具平铺，且仅存在于 `toolResponse` 的耗时、token 与工具统计会在映射阶段丢失。用户因此无法从主对话理解一次子 Agent 委派做了什么、消耗多少资源以及返回了什么结果。

## What Changes

- 将 Claude Code 的 Agent 工具识别为子 Agent 调用，并把经过白名单归一化的运行摘要随现有 chat stream 事件透传和持久化。
- 保留 Claude Agent 标准 ACP content 的全部文本块，并以双换行恢复块边界，避免正文与供应商尾注粘连。
- 在 assistant 消息内按 `parentToolCallId` 建立子 Agent 调用树；已关联的子工具不再作为顶层普通工具平铺，无法安全关联的工具保持现有展示。
- 将发起子 Agent 的父工具渲染为独立、可聚焦的状态卡片，并在运行中持续更新标题、状态与可用统计。
- 点击卡片打开响应式 Slideover，展示子 Agent prompt、Agent 类型、resolved model、上游统计、分层工具调用和最终回复。
- 为并行调用、延迟关联、失败或中断、缺失统计、无子工具、旧历史消息和超长内容定义明确的降级行为。
- 首版明确保证 Claude Code 的私有元数据适配；renderer 使用供应商无关的结构化数据，不根据工具名称猜测其他 Agent 的子 Agent 语义。

## Capabilities

### New Capabilities

- `subagent-call-inspector`: 定义聊天消息中子 Agent 调用卡片、父子调用投影、实时详情 Slideover、统计展示与兼容降级行为。

### Modified Capabilities

- 无。

## Impact

- 跨进程流事件：`src/shared/types/stream-event.ts` 增加可选、结构化的子 Agent 运行摘要。
- Claude Code ACP 映射：`src/main/services/session/chat/acp-mapper/agent-adapters/claude.ts` 白名单提取 Agent `toolResponse` 数据。
- 消息组装：main 持久化 assembler 与 renderer 实时 assembler 必须以相同合并规则保留父子关系和运行摘要。
- Renderer chat：assistant tool projection、专用卡片、Slideover、格式化与 overlay 装配。
- 测试：main mapper/domain assembler、renderer assembler/model projection 与组件交互测试；不引入新依赖、不新增 IPC channel、不改变会话 token usage 计算。
