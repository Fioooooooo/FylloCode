# Chat Composer

状态：未来重组方向，仅作边界留存；当前生产代码尚未迁入本目录。

## 目标

将消息草稿、slash command、附件、prompt 配置、焦点控制和提交动作组织成一个具有完整交互生命周期的 Chat Composer，而不是继续按 component/composable/utils 分散。

## 当前来源

- `src/renderer/src/components/chat/prompt/**`
- `src/renderer/src/composables/useChatPrompt.ts`
- `src/renderer/src/composables/useChatAttachment.ts`
- `src/renderer/src/utils/chat-prompt.ts`
- `src/renderer/src/utils/chat-prompt-attachment.ts`

## 预期边界

- `model`：command selection、draft/attachment 纯模型和提交输入构造。
- `application`：composer session、附件生命周期、提交与清理编排。
- `ui`：ChatPromptPanel、AttachmentList、ConfigOptionsBar、SlashCommandMenu 等输入 UI。
- `integration`：与 ChatContainer、ACP capability 和宿主快捷键的装配。
- 对外只暴露 composer UI 入口和必要 commands/queries，不暴露内部 DOM/focus 状态。

## 保持在 feature 外

- `src/renderer/src/api/session/chat.ts`
- session/chat stores
- 通用消息 part 类型和跨进程 chat contract

Prompt timeline 是独立浏览能力，不并入 composer。迁移时不得改变发送时机、附件限制或 slash command 行为。
